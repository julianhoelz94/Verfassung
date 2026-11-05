package com.constitutionatlas.ingestion.service

import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNodeWrite
import java.util.UUID

/** One invocation's depth-first hierarchy and identity checks across all ordered roots. */
internal class OrderedImportValidation(private val outline: ImportOutlineValidation, private val predecessorVersionId: UUID?) {
    private val errors = mutableListOf<Pair<String, String>>()
    private val logicalIds = mutableSetOf<UUID>()

    /** Root membership is checked before traversal; shared rich-content checks run afterwards. */
    fun validate(roots: List<OrderedNodeWrite>): List<Pair<String, String>> {
        if (roots.any { it.kind !in outline.rootKinds }) errors += "ROOT_KIND" to "Roots must use one of ${outline.rootKinds.joinToString()}"
        roots.forEachIndexed { index, root -> visitNode(root, null, "roots[$index]") }
        return errors
    }

    /** Node ancestry precedes its identity check; descendants precede their containing entry's checks. */
    private fun visitNode(node: OrderedNodeWrite, parent: String?, path: String) {
        val kind = node.kind?.trim()?.lowercase().orEmpty()
        if (kind !in outline.allowedKinds) errors += "UNKNOWN_KIND" to "$path: kind '$kind' is not in the outline"
        if (parent != null && kind !in outline.children(parent)) errors += "HIERARCHY_KIND" to "$path: '$kind' is not allowed under '$parent'"
        if (outline.forbidsText(kind) && node.content.orEmpty().any { it.type == "text" }) {
            errors += "TEXT_ALONGSIDE_CHILDREN" to "$path: text is not allowed in '$kind'"
        }
        checkAncestry(node.revisionId, node.predecessorRevisionId, node.lineage, path)
        checkIdentity(node.logicalId)
        node.content.orEmpty().forEachIndexed { index, entry -> visitEntry(entry, kind, "$path.content[$index]") }
    }

    /** Entry identities share the node namespace; annotation validation also applies to child entries. */
    private fun visitEntry(entry: OrderedEntryWrite, parent: String, path: String) {
        entry.node?.let { visitNode(it, parent, "$path.node") }
        checkIdentity(entry.logicalId)
        checkAncestry(entry.revisionId, entry.predecessorRevisionId, entry.lineage, path)
        errors += ImportRichContentValidation.entryErrors(entry, path)
    }

    /** Stored revision reuse is always rejected; predecessor and lineage references require a version pin. */
    private fun checkAncestry(revisionId: UUID?, predecessorRevisionId: UUID?, lineage: List<UUID>, path: String) {
        if (revisionId != null || ((predecessorRevisionId != null || lineage.isNotEmpty()) && predecessorVersionId == null)) {
            errors += "REVISION_REFERENCE" to "$path: ancestry requires a pinned predecessor version; stored revision reuse is not supported"
        }
    }

    /** Null identities are allocated later; every repeated explicit identity yields one diagnostic. */
    private fun checkIdentity(logicalId: UUID?) {
        if (logicalId != null && !logicalIds.add(logicalId)) errors += "DUPLICATE_LOGICAL_ID" to "Logical identities must be unique"
    }
}

package com.constitutionatlas.platform

import java.util.UUID

/** One node occurrence with its original traversal ancestry and version-scoped references. */
internal data class IndexedDiffNode(val node: DiffNode, val ref: DiffRef, val ancestors: List<UUID>, val versionId: UUID?) {
    /** Text is owned by its enclosing node; exact wording and logical paths enter the fingerprint. */
    fun textRef(entry: DiffEntry.Text): DiffRef = DiffRef(versionId, entry.logicalId, entry.revisionId, entry.occurrenceId, "text_entry", null, ref.path + "text", entry.text, ref.pathLogicalIds + entry.logicalId)
}

/** Read-only lookup views over the same preorder traversal, retaining duplicate logical identities. */
internal class DiffTreeIndex(val nodes: List<IndexedDiffNode>) {
    val byLogical = nodes.groupBy { it.node.logicalId }
    val byOccurrence = occurrenceIndex()
    val byRevision = revisionIndex()
    val logicalCounts = nodes.groupingBy { it.node.logicalId }.eachCount()
    val byId = nodes.associateBy { it.node.logicalId }
    val texts = textIndex()

    /** Null occurrence IDs cannot provide predecessor matches. */
    private fun occurrenceIndex() = nodes.filter { it.node.occurrenceId != null }.groupBy { it.node.occurrenceId }

    /** Revision lineage can point to several occurrences, whose traversal order is preserved. */
    private fun revisionIndex() = nodes.filter { it.node.revisionId != null }.groupBy { it.node.revisionId }

    /** Global text lookup retains duplicates so cross-parent movement requires unique identity. */
    private fun textIndex() = nodes.flatMap { parent -> parent.node.entries.filterIsInstance<DiffEntry.Text>().map { it.logicalId to (parent to it) } }.groupBy({ it.first }, { it.second })

    companion object {
        val ROOT_ID: UUID = UUID.nameUUIDFromBytes("constitution-diff-root".toByteArray())

        /** Adds the unchanged synthetic constitution root so top-level siblings share one parent. */
        fun create(roots: List<DiffNode>, versionId: UUID?): DiffTreeIndex {
            val root = DiffNode(ROOT_ID, null, null, "constitution", null, null, roots.map(DiffEntry::Child))
            val result = mutableListOf<IndexedDiffNode>()

            /** Visits nodes before descendants and preserves authored kind/label strings in paths. */
            fun visit(node: DiffNode, ancestors: List<UUID>, path: List<String>) {
                val here = path + "${node.kind}:${node.label.orEmpty()}"
                result += IndexedDiffNode(node, DiffRef(versionId, node.logicalId, node.revisionId, node.occurrenceId, node.kind, node.label, here, node.title, ancestors + node.logicalId), ancestors, versionId)
                node.entries.forEach { if (it is DiffEntry.Child) visit(it.node, ancestors + node.logicalId, here) }
            }
            visit(root, emptyList(), emptyList())
            return DiffTreeIndex(result)
        }
    }
}

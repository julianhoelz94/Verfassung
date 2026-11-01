package com.constitutionatlas.content.service

import com.constitutionatlas.content.api.OrderedEntryWrite
import com.constitutionatlas.content.api.OrderedNode
import com.constitutionatlas.content.api.OrderedNodeWrite
import com.constitutionatlas.content.api.OrderedSnapshot
import com.constitutionatlas.content.repo.OrderedContentRepository
import com.constitutionatlas.platform.OrderedRichContent
import java.util.UUID

/** Creates immutable revisions using only the pinned current/source snapshots as reuse membership. */
internal class OrderedRevisionWriter(private val repository: OrderedContentRepository, private val version: UUID, current: OrderedSnapshot, source: OrderedSnapshot?) {
    private val allowedNodes = mutableMapOf<UUID, OrderedNode>()
    private val allowedTexts = mutableMapOf<UUID, Pair<UUID, String>>()

    init {
        collectSnapshots(current, source)
    }

    /** The source is collected last, retaining its precedence for repeated revision identities. */
    private fun collectSnapshots(current: OrderedSnapshot, source: OrderedSnapshot?) {
        current.roots.forEach(::collect)
        source?.roots?.forEach(::collect)
    }

    /** Newly inserted revisions never expand this pinned membership index. */
    private fun collect(node: OrderedNode) {
        allowedNodes[node.revisionId] = node
        node.content.forEach { entry ->
            entry.node?.let(::collect)
            entry.revisionId?.let { allowedTexts[it] = entry.logicalId!! to entry.text!! }
        }
    }

    /** Depth and reference fields are checked before changed-node identity allocation or writes. */
    fun store(node: OrderedNodeWrite, depth: Int): UUID {
        require(depth < 128) { "Hierarchy exceeds 128 levels" }
        node.revisionId?.let { return nodeReference(node, it) }
        val kind = node.kind ?: throw IllegalArgumentException("kind is required for a changed node")
        val entries = node.content ?: throw IllegalArgumentException("content is required for a changed node")
        val logical = node.logicalId ?: UUID.randomUUID()
        node.predecessorRevisionId?.let { predecessor ->
            require(allowedNodes[predecessor]?.logicalId == logical) { "Node predecessor is not the pinned logical unit" }
        }
        if (allowedNodes.values.any { it.logicalId == logical }) require(node.predecessorRevisionId != null) { "Existing logical unit requires its predecessor revision" }
        require(node.lineage.all { it in allowedNodes }) { "Unknown split/merge node lineage" }
        val revision = UUID.randomUUID()
        repository.insertNode(revision, logical, version, node.predecessorRevisionId, kind, node.label, node.title, lineage = node.lineage)
        entries.forEachIndexed { position, entry -> storeEntry(entry, logical, revision, position, depth) }
        repository.seal(revision)
        return revision
    }

    /** A stored node reference has no authored replacement fields and must belong to either pinned snapshot. */
    private fun nodeReference(node: OrderedNodeWrite, revision: UUID): UUID {
        require(node.content == null && node.kind == null && node.logicalId == null && node.predecessorRevisionId == null && node.label == null && node.title == null && node.lineage.isEmpty()) { "A revision reference cannot also contain changed node fields" }
        require(revision in allowedNodes) { "Node revision is not a member of source or target snapshot" }
        return revision
    }

    /** Child payloads are checked before recursion, and each entry is inserted at its authored position. */
    private fun storeEntry(entry: OrderedEntryWrite, logical: UUID, revision: UUID, position: Int, depth: Int) {
        when (entry.type) {
            "child" -> {
                require(entry.node != null && entry.text == null && entry.revisionId == null && entry.logicalId == null && entry.predecessorRevisionId == null && entry.lineage.isEmpty() && entry.format == null && entry.table == null && entry.footnoteLabel == null && entry.references.isEmpty() && entry.annotation == null && entry.marks.isEmpty() && entry.lineBreaksBefore == 0) { "Invalid child entry at $logical/content/$position" }
                repository.insertEntry(revision, position, null, store(requireNotNull(entry.node), depth + 1))
            }
            "text" -> {
                require(entry.node == null) { "Text entry cannot contain a child" }
                val textRevision = if (entry.revisionId != null) textReference(entry) else storeText(entry, logical, position)
                repository.insertEntry(revision, position, textRevision, null)
            }
            else -> throw IllegalArgumentException("Entry type must be text or child at $logical/content/$position")
        }
    }

    /** Text reuse is independent of generated revisions from earlier entries in the same request. */
    private fun textReference(entry: OrderedEntryWrite): UUID {
        require(entry.text == null && entry.logicalId == null && entry.predecessorRevisionId == null && entry.lineage.isEmpty() && entry.format == null && entry.table == null && entry.footnoteLabel == null && entry.references.isEmpty() && entry.annotation == null && entry.marks.isEmpty() && entry.lineBreaksBefore == 0) { "Text reference cannot contain changed fields" }
        require(entry.revisionId in allowedTexts) { "Text reference is not in the pinned snapshot" }
        return requireNotNull(entry.revisionId)
    }

    /** Format checks precede identity allocation, predecessor/lineage checks and immutable insertion. */
    private fun storeText(entry: OrderedEntryWrite, logical: UUID, position: Int): UUID {
        val format = entry.format ?: "plain"
        require(format in setOf("plain", "table", "footnote")) { "Unknown rich content format at $logical/content/$position" }
        require((format == "table") == (entry.table != null)) { "Table payload and format must agree at $logical/content/$position" }
        require(format == "footnote" || (entry.footnoteLabel == null && entry.annotation == null)) { "Footnote label needs a footnote entry" }
        require(format == "plain" || entry.references.isEmpty()) { "Inline references need a plain text entry" }
        val text = if (format == "table") entry.table!!.plainText() else entry.text ?: throw IllegalArgumentException("Text is required at $logical/content/$position")
        if (format == "table" && entry.text != null) require(entry.text == text) { "Table text does not match cells at $logical/content/$position" }
        val textLogical = entry.logicalId ?: UUID.randomUUID()
        entry.predecessorRevisionId?.let { require(allowedTexts[it]?.first == textLogical) { "Text predecessor does not match logical identity" } }
        if (allowedTexts.values.any { it.first == textLogical }) require(entry.predecessorRevisionId != null) { "Existing text identity requires its predecessor revision" }
        require(entry.lineage.all { it in allowedTexts }) { "Unknown split/merge lineage" }
        val id = UUID.randomUUID()
        repository.insertText(id, textLogical, version, entry.predecessorRevisionId, text, entry.lineage, format, OrderedRichContent(entry.table, entry.footnoteLabel, entry.references, entry.annotation, entry.marks, entry.lineBreaksBefore))
        return id
    }
}

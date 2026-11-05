package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.client.DraftSettings
import com.constitutionatlas.platform.OrderedContentPosition
import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.OrderedInlineReference
import java.util.UUID

/** Shared final-tree invariants used by replay, preparation, and publication readiness. */
internal object DraftReplayValidation {
    /** Complete-document marker checks retain separate reference-identity and cardinality phases. */
    fun requireFootnoteMarkers(roots: List<DraftNode>) {
        val notes = mutableListOf<OrderedContentPosition>()
        val references = mutableListOf<OrderedInlineReference>()

        /** Visits every stored entry while retaining original root/content paths. */
        fun walk(node: DraftNode, path: String) {
            node.content.forEachIndexed { index, entry ->
                val entryPath = "$path.content[$index]"
                entry.node?.let { walk(it, "$entryPath.node") } ?: run {
                    notes += OrderedContentPosition(entryPath, entry.logicalId, format = entry.format, references = entry.references)
                    references += entry.references
                }
            }
        }
        roots.forEachIndexed { index, root -> walk(root, "roots[$index]") }
        OrderedContentRules.requireValid(OrderedContentRules.referenceIdentityErrors(notes) + OrderedContentRules.footnoteMarkerErrors(notes, references))
    }

    /** Validates the final batch tree: structure first, then endnote order and rich text payloads. */
    fun validate(roots: List<DraftNode>, settings: DraftSettings, enforceEndnotes: Boolean = true) {
        val ids = mutableSetOf<UUID>()
        val levels = settings.outline.kinds
        val byCode = levels.associateBy { it.kindCode }
        val rootKinds = levels.filter { it.root }.map { it.kindCode }.toSet().ifEmpty { setOfNotNull(levels.firstOrNull()?.kindCode) }

        /** Identity checks precede kind, parentage, headings and each ordered entry. */
        fun walk(node: DraftNode, parent: com.constitutionatlas.editor.client.DraftLevel?, depth: Int) {
            require(depth < 128 && ids.add(node.logicalId)) { "Duplicate or cyclic node identity '${node.logicalId}'" }
            val level = byCode[node.kind] ?: throw IllegalArgumentException("Unknown kind '${node.kind}' at '${node.logicalId}'")
            require(if (parent == null) node.kind in rootKinds else node.kind in parent.allowedChildKinds) { "Invalid kind/parentage at '${node.logicalId}'" }
            require(level.titlePolicy != "required" || !node.title.isNullOrBlank()) { "Title required at '${node.logicalId}'" }
            require(level.titlePolicy != "none" || node.title.isNullOrEmpty()) { "Title forbidden at '${node.logicalId}'" }
            require(level.labelPolicy != "required" || !node.label.isNullOrBlank()) { "Literal label required at '${node.logicalId}'" }
            require(level.labelPolicy != "none" || node.label.isNullOrEmpty()) { "Literal label forbidden at '${node.logicalId}'" }
            node.content.forEach { entry ->
                when (entry.type) {
                    "text" -> require(level.mayHoldText && entry.node == null && entry.text != null && entry.logicalId != null && ids.add(entry.logicalId)) { "Invalid or duplicate text entry at '${node.logicalId}'" }
                    "child" -> {
                        require(level.mayHoldChildren && entry.node != null && entry.logicalId == null && entry.text == null && entry.node.kind in level.allowedChildKinds) { "Invalid child at '${node.logicalId}'" }
                        require(entry.format == null && entry.table == null && entry.footnoteLabel == null && entry.references.isEmpty() && entry.annotation == null && entry.marks.isEmpty() && entry.lineBreaksBefore == 0) { "Text formatting belongs to text entries at '${node.logicalId}'" }
                        walk(entry.node!!, level, depth + 1)
                    }
                    else -> throw IllegalArgumentException("Invalid entry type '${entry.type}'")
                }
            }
        }
        roots.forEach { walk(it, null, 0) }
        val positions = mutableListOf<OrderedContentPosition>()
        val texts = mutableListOf<Pair<String, DraftEntry>>()

        /** Collects all roots before rich checks so references may resolve across root boundaries. */
        fun collect(node: DraftNode, path: String) {
            positions += OrderedContentPosition(path, node.logicalId, node = true)
            node.content.forEachIndexed { index, entry ->
                val entryPath = "$path.content[$index]"
                entry.node?.let { collect(it, "$entryPath.node") } ?: run {
                    positions += OrderedContentPosition(entryPath, entry.logicalId, format = entry.format, text = entry.text)
                    texts += entryPath to entry
                }
            }
        }
        roots.forEachIndexed { index, root -> collect(root, "roots[$index]") }
        if (enforceEndnotes) OrderedContentRules.requireValid(OrderedContentRules.endnoteErrors(positions))
        val footnotes = texts.mapNotNull { (_, entry) -> entry.logicalId.takeIf { entry.format == "footnote" } }.toSet()
        texts.forEach { (path, entry) ->
            val format = entry.format ?: "plain"
            require(format in setOf("plain", "table", "footnote") && (format == "table") == (entry.table != null)) { "Invalid rich content format at $path" }
            require(format == "footnote" || entry.footnoteLabel == null && entry.annotation == null) { "Footnote fields require a footnote body at $path" }
            require(format != "footnote" || !entry.text.isNullOrBlank()) { "Footnote body is required at $path" }
            entry.annotation?.validate()
            require(entry.annotation?.anchorLogicalIds.orEmpty().all { it in ids }) { "Annotation has unknown unit anchor at $path" }
            OrderedContentRules.requireValid(OrderedContentRules.lineBreakErrors(entry.lineBreaksBefore, entry.type, "$path.lineBreaksBefore", entry.logicalId))
            OrderedContentRules.requireValid(OrderedContentRules.markErrors(entry.text.orEmpty(), format, entry.marks, "$path.marks", entry.logicalId))
            OrderedContentRules.requireValid(OrderedContentRules.referenceErrors(entry.text.orEmpty(), format, entry.references, footnotes, path, entry.logicalId, units = ids.takeIf { enforceEndnotes }))
        }
    }
}

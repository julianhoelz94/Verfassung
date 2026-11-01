package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.platform.OrderedContentRules
import java.util.UUID

/** One operation's pinned target and mutable root result; validation of the complete batch stays outside. */
internal class DraftReplayStep(var roots: List<DraftNode>, val operation: DraftOperation) {
    var foundNode: DraftNode? = null
        private set
    var foundEntry: DraftEntry? = null
        private set

    /** Validates separators before target lookup and stale-token checks, preserving failure precedence. */
    fun replay(): List<DraftNode> {
        validateSeparators()
        roots.forEach(::findTarget)
        val token = foundNode?.let { it.draftId ?: it.revisionId } ?: foundEntry?.let { it.draftId ?: it.revisionId }
        if (token != operation.expectedRevisionId) throw ConflictException("Stale or unknown unit '${operation.targetId}'", "stale_draft_unit")
        when (operation.type) {
            "insert_root" -> DraftReplayTree.insertRoot(this)
            "move_root" -> DraftReplayTree.moveRoot(this)
            "replace_text" -> DraftReplayText.replace(this)
            "set_metadata" -> DraftReplayTree.setMetadata(this)
            "insert_text", "insert_child" -> DraftReplayTree.insertEntry(this)
            "remove" -> DraftReplayTree.remove(this)
            "split_text" -> DraftReplayText.split(this)
            "merge_text" -> DraftReplayText.merge(this)
            "move" -> DraftReplayTree.move(this)
            else -> throw IllegalArgumentException("Unknown draft operation '${operation.type}'")
        }
        return roots
    }

    /** Every part is checked, including fields unused by the operation handler. */
    private fun validateSeparators() {
        operation.lineBreaksBefore?.let { count ->
            require(operation.type == "replace_text" && operation.format != null) { "A text separator update requires a rich replace_text operation" }
            OrderedContentRules.requireValid(OrderedContentRules.lineBreakErrors(count, "text", "operations[${operation.id}].lineBreaksBefore", operation.targetId))
        }
        operation.parts.forEachIndexed { index, part ->
            OrderedContentRules.requireValid(OrderedContentRules.lineBreakErrors(part.lineBreaksBefore, "text", "operations[${operation.id}].parts[$index].lineBreaksBefore", part.logicalId))
        }
    }

    /** Preorder lookup deliberately keeps the last match; node tokens take precedence over entry tokens. */
    private fun findTarget(node: DraftNode) {
        if (node.logicalId == operation.targetId) foundNode = node
        node.content.forEach { entry ->
            if (entry.logicalId == operation.targetId || entry.node?.logicalId == operation.targetId) foundEntry = entry
            entry.node?.let(::findTarget)
        }
    }

    /** Applies a transform postorder after copying child contents, exactly once for each node occurrence. */
    fun updateNodes(transform: (DraftNode) -> DraftNode) {
        roots = roots.map { map(it, transform) }
    }

    /** Rebuilds child wrappers before invoking the parent transform so intermediate edits compose. */
    private fun map(node: DraftNode, transform: (DraftNode) -> DraftNode): DraftNode = transform(node.copy(content = node.content.map { entry -> entry.node?.let { entry.copy(node = map(it, transform)) } ?: entry }))

    /** Rewrites all unit references and annotation anchors, stamping only changed entries and parents. */
    fun remapTargets(replacements: Map<UUID, List<UUID>>) {
        updateNodes { node ->
            val content = node.content.map { entry ->
                val annotation = entry.annotation
                val anchors = annotation?.anchorLogicalIds?.flatMap { replacements[it] ?: listOf(it) }?.distinct()
                val references = entry.references.map { reference ->
                    val replacement = if (reference.target.type == "unit") replacements[reference.target.logicalId]?.firstOrNull() else null
                    if (replacement == null || replacement == reference.target.logicalId) reference else reference.copy(target = reference.target.copy(logicalId = replacement))
                }
                if (anchors == annotation?.anchorLogicalIds && references == entry.references) {
                    entry
                } else {
                    entry.copy(draftId = operation.id, annotation = annotation?.copy(anchorLogicalIds = requireNotNull(anchors)), references = references)
                }
            }
            if (content == node.content) node else node.copy(content = content, draftId = operation.id)
        }
    }

    /** Text transforms may replace one entry with several, stamping enclosing parents with this operation token. */
    fun targetText(transform: (DraftEntry) -> List<DraftEntry>) {
        require(foundEntry?.type == "text") { "Operation requires a text entry" }
        updateNodes { node ->
            if (node.content.any { it.logicalId == operation.targetId }) node.copy(draftId = operation.id, content = node.content.flatMap { entry -> if (entry.logicalId == operation.targetId) transform(entry) else listOf(entry) }) else node
        }
    }
}

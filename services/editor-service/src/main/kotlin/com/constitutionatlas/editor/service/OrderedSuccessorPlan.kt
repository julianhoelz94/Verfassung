package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNodeWrite
import java.util.UUID

/** Reuses revisions by content equality; ancestor draft tokens are not a sharing decision. */
object OrderedSuccessorPlan {
    fun build(source: List<DraftNode>, target: List<DraftNode>, operations: List<DraftOperation>): List<OrderedNodeWrite> {
        val nodes = mutableMapOf<UUID, DraftNode>()
        val texts = mutableMapOf<UUID, DraftEntry>()
        fun collect(node: DraftNode) {
            nodes[node.logicalId] = node
            node.content.forEach { entry -> entry.node?.let(::collect) ?: run { texts[requireNotNull(entry.logicalId)] = entry } }
        }
        source.forEach(::collect)
        val ancestry = texts.mapValues { (_, entry) -> listOf(requireNotNull(entry.revisionId)) }.toMutableMap()
        operations.forEach { operation ->
            when (operation.type) {
                "split_text" -> operation.parts.forEach { ancestry[it.logicalId] = ancestry[operation.targetId].orEmpty() }
                "merge_text" -> operation.parts.firstOrNull()?.let { part -> ancestry[part.logicalId] = operation.mergeIds.flatMap { ancestry[it].orEmpty() }.distinct() }
            }
        }
        fun nodeWrite(node: DraftNode): OrderedNodeWrite {
            val original = nodes[node.logicalId]
            val content = node.content.map { entry ->
                val child = entry.node
                if (child != null) {
                    OrderedEntryWrite("child", node = nodeWrite(child))
                } else {
                    val old = texts[entry.logicalId]
                    if (old != null && old.text == entry.text) {
                        OrderedEntryWrite("text", revisionId = requireNotNull(old.revisionId))
                    } else {
                        OrderedEntryWrite("text", logicalId = requireNotNull(entry.logicalId), predecessorRevisionId = old?.revisionId, text = requireNotNull(entry.text), lineage = ancestry[entry.logicalId].orEmpty().filter { it != old?.revisionId })
                    }
                }
            }
            val unchanged = original != null &&
                original.kind == node.kind &&
                original.label == node.label &&
                original.title == node.title &&
                original.content.size == content.size &&
                original.content.zip(content).all { (old, next) ->
                    if (old.node != null) next.node?.revisionId == old.node.revisionId else next.revisionId == old.revisionId
                }
            return if (unchanged) {
                OrderedNodeWrite(revisionId = requireNotNull(original?.revisionId))
            } else {
                OrderedNodeWrite(logicalId = node.logicalId, predecessorRevisionId = original?.revisionId, kind = node.kind, label = node.label, title = node.title, content = content)
            }
        }
        return target.map(::nodeWrite)
    }
}

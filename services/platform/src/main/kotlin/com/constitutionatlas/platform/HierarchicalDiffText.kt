package com.constitutionatlas.platform

import java.util.UUID

/** Global text movement and local text lineage, sharing one ordered finding collector. */
internal object DiffTextComparison {
    /** Unique text identities move globally before local node content is inspected. */
    fun crossParentMoves(old: DiffTreeIndex, fresh: DiffTreeIndex, matches: DiffNodeMatches, items: DiffItemCollector): Set<UUID> {
        val moved = mutableSetOf<UUID>()
        for ((id, previous) in old.texts) {
            val next = fresh.texts[id].orEmpty()
            if (previous.size != 1 || next.size != 1) continue
            val (oldParent, oldText) = previous.single()
            val (newParent, newText) = next.single()
            if (oldParent.node.logicalId == (matches.pairs[newParent.node.logicalId]?.node?.logicalId ?: newParent.node.logicalId)) continue
            moved += id
            items.emit("move", listOf(oldParent.textRef(oldText)), listOf(newParent.textRef(newText)))
            if (oldText.text != newText.text || oldText.semantic != newText.semantic) items.emit("text_changed", listOf(oldParent.textRef(oldText)), listOf(newParent.textRef(newText)))
        }
        return moved
    }
}

/** A matched node pair's text groups; global moves suppress redundant local add/remove findings. */
internal class DiffTextMatch(private val source: IndexedDiffNode, private val target: IndexedDiffNode, private val moved: Set<UUID>, private val items: DiffItemCollector) {
    private val sourceText = source.node.entries.filterIsInstance<DiffEntry.Text>().associateBy { it.logicalId }
    private val targetText = target.node.entries.filterIsInstance<DiffEntry.Text>().associateBy { it.logicalId }
    private val sourceByRevision = revisionIndex()
    private val groupedSource = mutableSetOf<UUID>()
    private val groupedTarget = mutableSetOf<UUID>()

    /** Emits splits, merges, removals and target changes in the established phase order. */
    fun compare() {
        splits()
        merges()
        removals()
        changes()
    }

    /** Null revisions cannot establish text lineage. */
    private fun revisionIndex() = sourceText.values.filter { it.revisionId != null }.groupBy { it.revisionId }

    /** Multiple descendants of an existing revision retain lineage order and ambiguous group keys. */
    private fun splits() {
        val splitText = targetText.values.flatMap { targetEntry -> targetEntry.lineageRevisionIds.map { it to targetEntry } }
            .groupBy({ it.first }, { it.second }).filter { (_, entries) -> entries.size > 1 }
        for ((revision, entries) in splitText) {
            val originals = sourceByRevision[revision].orEmpty()
            if (originals.isEmpty()) continue
            groupedSource += originals.map { it.logicalId }
            groupedTarget += entries.map { it.logicalId }
            items.emit("split", originals.map(source::textRef), entries.map(target::textRef), true, diffDigest("split|$revision"))
        }
    }

    /** A target with several distinct source identities forms a merge unless already split-grouped. */
    private fun merges() {
        for (entry in targetText.values) {
            val originals = entry.lineageRevisionIds.flatMap { sourceByRevision[it].orEmpty() }.distinctBy { it.logicalId }
            if (originals.size < 2 || entry.logicalId in groupedTarget) continue
            groupedSource += originals.map { it.logicalId }
            groupedTarget += entry.logicalId
            items.emit("merge", originals.map(source::textRef), listOf(target.textRef(entry)), true, diffDigest("merge|${originals.joinToString { it.logicalId.toString() }}"))
        }
    }

    /** Grouped and globally moved text must not also appear as a local removal. */
    private fun removals() {
        for (entry in sourceText.values) {
            if (entry.logicalId !in targetText && entry.logicalId !in groupedSource && entry.logicalId !in moved) items.emit("text_removed", listOf(source.textRef(entry)), emptyList())
        }
    }

    /** Exact text and rich semantic signatures are independent change triggers. */
    private fun changes() {
        for (entry in targetText.values) {
            if (entry.logicalId in groupedTarget || entry.logicalId in moved) continue
            val previous = sourceText[entry.logicalId]
            if (previous == null) {
                items.emit("text_added", emptyList(), listOf(target.textRef(entry)))
            } else if (previous.text != entry.text || previous.semantic != entry.semantic) {
                items.emit("text_changed", listOf(source.textRef(previous)), listOf(target.textRef(entry)))
            }
        }
    }
}

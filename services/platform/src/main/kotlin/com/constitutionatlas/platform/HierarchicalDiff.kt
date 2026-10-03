package com.constitutionatlas.platform

import java.security.MessageDigest
import java.util.UUID

/** A normalized, ordered tree. Text entries are units owned by their enclosing node. */
data class DiffNode(
    val logicalId: UUID,
    val revisionId: UUID?,
    val occurrenceId: UUID?,
    val kind: String,
    val label: String?,
    val title: String?,
    val entries: List<DiffEntry>,
    val predecessorId: UUID? = null,
    val lineage: List<UUID> = emptyList(),
)

sealed interface DiffEntry {
    data class Text(val logicalId: UUID, val revisionId: UUID?, val occurrenceId: UUID?, val text: String, val lineageRevisionIds: List<UUID> = emptyList()) : DiffEntry
    data class Child(val node: DiffNode) : DiffEntry
}

data class DiffRef(
    val versionId: UUID?,
    val logicalId: UUID,
    val revisionId: UUID?,
    val occurrenceId: UUID?,
    val kind: String,
    val label: String?,
    val path: List<String>,
    val excerpt: String?,
    val pathLogicalIds: List<UUID> = emptyList(),
)

data class DiffItem(
    val key: String,
    val fingerprint: String,
    val facet: String,
    val level: Int,
    val beforeRefs: List<DiffRef>,
    val afterRefs: List<DiffRef>,
    val ambiguous: Boolean = false,
    val groupKey: String? = null,
)

data class DiffRun(val items: List<DiffItem>, val settingsImpact: Boolean)

object HierarchicalDiff {
    const val ALGORITHM_VERSION = "hierarchical-1"

    fun compare(
        beforeVersionId: UUID?,
        before: List<DiffNode>,
        afterVersionId: UUID?,
        after: List<DiffNode>,
        beforeSettingsRevisionId: UUID? = null,
        afterSettingsRevisionId: UUID? = null,
        skipSharedRevision: Boolean = true,
    ): DiffRun {
        val rootId = UUID.nameUUIDFromBytes("constitution-diff-root".toByteArray())
        val old = index(listOf(DiffNode(rootId, null, null, "constitution", null, null, before.map(DiffEntry::Child))), beforeVersionId)
        val fresh = index(listOf(DiffNode(rootId, null, null, "constitution", null, null, after.map(DiffEntry::Child))), afterVersionId)
        val oldByLogical = old.groupBy { it.node.logicalId }
        val oldByOccurrence = old.filter { it.node.occurrenceId != null }.groupBy { it.node.occurrenceId }
        val oldByRevision = old.filter { it.node.revisionId != null }.groupBy { it.node.revisionId }
        val freshCounts = fresh.groupingBy { it.node.logicalId }.eachCount()
        val splitTargets = fresh.filter { it.node.predecessorId != null }.groupBy { it.node.predecessorId }
            .filter { (id, targets) -> id in oldByOccurrence && targets.size > 1 }
        val groupedOld = mutableSetOf<UUID>()
        val groupedFresh = mutableSetOf<UUID>()
        val groups = mutableListOf<Pair<List<IndexedNode>, List<IndexedNode>>>()
        for ((id, targets) in splitTargets) {
            val sources = oldByOccurrence[id].orEmpty()
            groups += sources to targets
            groupedOld += sources.map { it.node.logicalId }
            groupedFresh += targets.map { it.node.logicalId }
        }
        val lineageSplitTargets = fresh.flatMap { target -> target.node.lineage.map { it to target } }
            .groupBy({ it.first }, { it.second }).filter { (revision, targets) -> revision in oldByRevision && targets.size > 1 }
        for ((revision, targets) in lineageSplitTargets) {
            val sources = oldByRevision[revision].orEmpty()
            if (sources.any { it.node.logicalId in groupedOld } || targets.any { it.node.logicalId in groupedFresh }) continue
            groups += sources to targets
            groupedOld += sources.map { it.node.logicalId }
            groupedFresh += targets.map { it.node.logicalId }
        }
        for (target in fresh) {
            val sources = target.node.lineage.flatMap { oldByRevision[it].orEmpty() + oldByOccurrence[it].orEmpty() }.distinctBy { it.node.logicalId }
            if (sources.size > 1 && target.node.logicalId !in groupedFresh) {
                groups += sources to listOf(target)
                groupedOld += sources.map { it.node.logicalId }
                groupedFresh += target.node.logicalId
            }
        }
        val pairs = mutableMapOf<UUID, IndexedNode>()
        val usedOld = mutableSetOf<UUID>()
        val ambiguous = mutableSetOf<UUID>()
        for (target in fresh) {
            if (target.node.logicalId in groupedFresh) continue
            val matches = oldByLogical[target.node.logicalId].orEmpty().filter { it.node.logicalId !in usedOld }
            val lineage = target.node.predecessorId?.let { oldByOccurrence[it].orEmpty() }.orEmpty().filter { it.node.logicalId !in usedOld }
            val choices = if (lineage.isNotEmpty()) lineage else matches
            if (choices.size == 1 && choices.single().node.logicalId !in groupedOld && freshCounts[target.node.logicalId] == 1) {
                pairs[target.node.logicalId] = choices.single()
                usedOld += choices.single().node.logicalId
            } else if (choices.size > 1 || (freshCounts[target.node.logicalId] ?: 0) > 1) {
                ambiguous += target.node.logicalId
            }
        }
        val items = mutableListOf<DiffItem>()
        fun emit(facet: String, beforeRefs: List<DiffRef>, afterRefs: List<DiffRef>, isAmbiguous: Boolean = false, group: String? = null) {
            val identities = (beforeRefs + afterRefs).joinToString("|") { "${it.versionId}:${it.logicalId}:${it.kind}" }
            val key = digest("$ALGORITHM_VERSION|$facet|$identities")
            val fingerprint = digest("$key|${(beforeRefs + afterRefs).joinToString("|") { "${it.revisionId}:${it.pathLogicalIds}:${it.path}:${it.excerpt}" }}")
            items += DiffItem(key, fingerprint, facet, (afterRefs.firstOrNull() ?: beforeRefs.first()).path.size - 1, beforeRefs, afterRefs, isAmbiguous, group)
        }
        val oldById = old.associateBy { it.node.logicalId }
        val freshById = fresh.associateBy { it.node.logicalId }
        val pairedOld = pairs.values.map { it.node.logicalId }.toSet()
        val oldTexts = old.flatMap { parent -> parent.node.entries.filterIsInstance<DiffEntry.Text>().map { it.logicalId to (parent to it) } }.groupBy({ it.first }, { it.second })
        val freshTexts = fresh.flatMap { parent -> parent.node.entries.filterIsInstance<DiffEntry.Text>().map { it.logicalId to (parent to it) } }.groupBy({ it.first }, { it.second })
        val crossParentTexts = mutableSetOf<UUID>()
        for ((id, previous) in oldTexts) {
            val next = freshTexts[id].orEmpty()
            if (previous.size != 1 || next.size != 1) continue
            val (oldParent, oldText) = previous.single()
            val (newParent, newText) = next.single()
            if (oldParent.node.logicalId == (pairs[newParent.node.logicalId]?.node?.logicalId ?: newParent.node.logicalId)) continue
            crossParentTexts += id
            emit("move", listOf(oldParent.textRef(oldText)), listOf(newParent.textRef(newText)))
            if (oldText.text != newText.text) emit("text_changed", listOf(oldParent.textRef(oldText)), listOf(newParent.textRef(newText)))
        }

        for ((sources, targets) in groups) {
            val beforeRefs = sources.map { it.ref }
            val afterRefs = targets.map { it.ref }
            val group = digest("group|${(beforeRefs + afterRefs).joinToString("|") { it.logicalId.toString() }}")
            emit(if (targets.size > 1) "split" else "merge", beforeRefs, afterRefs, true, group)
        }

        // A missing or new subtree is one actionable finding, not one per descendant.
        for (source in old) {
            if (source.node.logicalId in pairedOld || source.node.logicalId in groupedOld || source.ancestors.any { it !in pairedOld || it in groupedOld }) continue
            emit("removed", listOf(source.ref), emptyList())
        }
        for (target in fresh) {
            if (target.node.logicalId in pairs || target.node.logicalId in groupedFresh || target.ancestors.any { it !in pairs || it in groupedFresh }) continue
            emit("added", emptyList(), listOf(target.ref), target.node.logicalId in ambiguous)
        }
        for (target in fresh) {
            val source = pairs[target.node.logicalId] ?: continue
            val sourceParent = source.ancestors.lastOrNull()
            val targetParent = target.ancestors.lastOrNull()
            if (sourceParent != targetParent?.let { pairs[it]?.node?.logicalId ?: it }) emit("move", listOf(source.ref), listOf(target.ref))
            if (skipSharedRevision && source.node.revisionId != null && source.node.revisionId == target.node.revisionId) continue
            if (source.node.kind != target.node.kind || source.node.label != target.node.label || source.node.title != target.node.title) {
                emit("metadata", listOf(source.ref), listOf(target.ref))
            }
            val sourceText = source.node.entries.filterIsInstance<DiffEntry.Text>().associateBy { it.logicalId }
            val targetText = target.node.entries.filterIsInstance<DiffEntry.Text>().associateBy { it.logicalId }
            val sourceByRevision = sourceText.values.filter { it.revisionId != null }.groupBy { it.revisionId }
            val splitText = targetText.values.flatMap { targetEntry -> targetEntry.lineageRevisionIds.map { it to targetEntry } }
                .groupBy({ it.first }, { it.second }).filter { (_, entries) -> entries.size > 1 }
            val groupedSourceText = mutableSetOf<UUID>()
            val groupedTargetText = mutableSetOf<UUID>()
            for ((revision, entries) in splitText) {
                val originals = sourceByRevision[revision].orEmpty()
                if (originals.isEmpty()) continue
                groupedSourceText += originals.map { it.logicalId }
                groupedTargetText += entries.map { it.logicalId }
                val beforeRefs = originals.map(source::textRef)
                val afterRefs = entries.map(target::textRef)
                emit("split", beforeRefs, afterRefs, true, digest("split|$revision"))
            }
            for (entry in targetText.values) {
                val originals = entry.lineageRevisionIds.flatMap { sourceByRevision[it].orEmpty() }.distinctBy { it.logicalId }
                if (originals.size < 2 || entry.logicalId in groupedTargetText) continue
                groupedSourceText += originals.map { it.logicalId }
                groupedTargetText += entry.logicalId
                emit("merge", originals.map(source::textRef), listOf(target.textRef(entry)), true, digest("merge|${originals.joinToString { it.logicalId.toString() }}"))
            }
            for (entry in sourceText.values) {
                if (entry.logicalId !in targetText && entry.logicalId !in groupedSourceText && entry.logicalId !in crossParentTexts) emit("text_removed", listOf(source.textRef(entry)), emptyList())
            }
            for (entry in targetText.values) {
                if (entry.logicalId in groupedTargetText || entry.logicalId in crossParentTexts) continue
                val previous = sourceText[entry.logicalId]
                if (previous == null) {
                    emit("text_added", emptyList(), listOf(target.textRef(entry)))
                } else if (previous.text != entry.text) {
                    emit("text_changed", listOf(source.textRef(previous)), listOf(target.textRef(entry)))
                }
            }
            // Relative order is compared only among shared siblings; insertion does not move later units.
            val sourceOrder = source.node.entries.mapNotNull { (it as? DiffEntry.Child)?.node?.logicalId ?: (it as? DiffEntry.Text)?.logicalId }
            val targetOrder = target.node.entries.mapNotNull { (it as? DiffEntry.Child)?.node?.logicalId ?: (it as? DiffEntry.Text)?.logicalId }
            val common = sourceOrder.toSet() intersect targetOrder.toSet()
            val oldSequence = sourceOrder.filter { it in common }
            val newSequence = targetOrder.filter { it in common }
            if (oldSequence != newSequence) {
                val sourcePositions = oldSequence.withIndex().associate { it.value to it.index }
                val stable = longestIncreasingSubsequence(newSequence.map { sourcePositions.getValue(it) }).map { newSequence[it] }.toSet()
                for (id in newSequence.filter { it !in stable }) {
                    val beforeRef = oldById[id]?.ref ?: sourceText[id]?.let(source::textRef)
                    val afterRef = freshById[id]?.ref ?: targetText[id]?.let(target::textRef)
                    if (beforeRef != null && afterRef != null) emit("move", listOf(beforeRef), listOf(afterRef))
                }
            }
        }
        val beforePositions = positions(before)
        val afterPositions = positions(after)
        fun order(ref: DiffRef, target: Boolean): List<Int> {
            val path = ref.pathLogicalIds
            if (target) return afterPositions[path] ?: emptyList()
            val anchor = (path.size downTo 1).firstOrNull { afterPositions.containsKey(path.take(it)) } ?: 0
            return afterPositions[path.take(anchor)].orEmpty() + beforePositions[path].orEmpty().drop((anchor - 1).coerceAtLeast(0))
        }
        val ordered = items.distinctBy { it.key }.sortedWith { left, right ->
            val a = left.afterRefs.firstOrNull()?.let { order(it, true) } ?: order(left.beforeRefs.first(), false)
            val b = right.afterRefs.firstOrNull()?.let { order(it, true) } ?: order(right.beforeRefs.first(), false)
            comparePositions(a, b).takeIf { it != 0 }
                ?: (facetPriority(left.facet).compareTo(facetPriority(right.facet))).takeIf { it != 0 }
                ?: left.key.compareTo(right.key)
        }
        return DiffRun(ordered, beforeSettingsRevisionId != afterSettingsRevisionId)
    }

    private fun positions(roots: List<DiffNode>): Map<List<UUID>, List<Int>> {
        val result = mutableMapOf<List<UUID>, List<Int>>()
        fun visit(node: DiffNode, path: List<UUID>, position: List<Int>) {
            val here = path + node.logicalId
            result[here] = position
            node.entries.forEachIndexed { index, entry ->
                when (entry) {
                    is DiffEntry.Child -> visit(entry.node, here, position + index)
                    is DiffEntry.Text -> result[here + entry.logicalId] = position + index
                }
            }
        }
        roots.forEachIndexed { index, root -> visit(root, listOf(UUID.nameUUIDFromBytes("constitution-diff-root".toByteArray())), listOf(index)) }
        return result
    }

    private fun comparePositions(a: List<Int>, b: List<Int>): Int {
        for (index in 0 until minOf(a.size, b.size)) {
            val compared = a[index].compareTo(b[index])
            if (compared != 0) return compared
        }
        return a.size.compareTo(b.size)
    }

    private fun facetPriority(facet: String): Int = when (facet) {
        "move" -> 0
        "metadata" -> 1
        else -> 2
    }

    private data class IndexedNode(val node: DiffNode, val ref: DiffRef, val ancestors: List<UUID>, val versionId: UUID?) {
        fun textRef(entry: DiffEntry.Text): DiffRef = DiffRef(versionId, entry.logicalId, entry.revisionId, entry.occurrenceId, "text_entry", null, ref.path + "text", entry.text, ref.pathLogicalIds + entry.logicalId)
    }

    private fun index(roots: List<DiffNode>, versionId: UUID?): List<IndexedNode> {
        val result = mutableListOf<IndexedNode>()
        fun visit(node: DiffNode, ancestors: List<UUID>, path: List<String>) {
            val here = path + "${node.kind}:${node.label.orEmpty()}"
            result += IndexedNode(node, DiffRef(versionId, node.logicalId, node.revisionId, node.occurrenceId, node.kind, node.label, here, node.title, ancestors + node.logicalId), ancestors, versionId)
            node.entries.forEach { if (it is DiffEntry.Child) visit(it.node, ancestors + node.logicalId, here) }
        }
        roots.forEach { visit(it, emptyList(), emptyList()) }
        return result
    }

    private fun longestIncreasingSubsequence(values: List<Int>): List<Int> {
        val tails = IntArray(values.size)
        val parent = IntArray(values.size) { -1 }
        var size = 0
        for (i in values.indices) {
            var low = 0
            var high = size
            while (low < high) {
                val middle = (low + high) / 2
                if (values[tails[middle]] < values[i]) low = middle + 1 else high = middle
            }
            if (low > 0) parent[i] = tails[low - 1]
            tails[low] = i
            if (low == size) size++
        }
        if (size == 0) return emptyList()
        var cursor = tails[size - 1]
        val indices = mutableListOf<Int>()
        while (cursor >= 0) {
            indices += cursor
            cursor = parent[cursor]
        }
        return indices.asReversed()
    }

    private fun digest(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}

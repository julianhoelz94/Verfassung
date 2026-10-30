package com.constitutionatlas.platform

import java.util.UUID

/** Relative sibling order uses a deterministic longest increasing subsequence of shared identities. */
internal object DiffSiblingOrdering {
    /** Inserted or removed siblings do not move shared units; mixed child/text order is significant. */
    fun compare(source: IndexedDiffNode, target: IndexedDiffNode, old: DiffTreeIndex, fresh: DiffTreeIndex, items: DiffItemCollector) {
        val sourceOrder = identities(source)
        val targetOrder = identities(target)
        val common = sourceOrder.toSet() intersect targetOrder.toSet()
        val oldSequence = sourceOrder.filter { it in common }
        val newSequence = targetOrder.filter { it in common }
        if (oldSequence == newSequence) return
        val sourcePositions = oldSequence.withIndex().associate { it.value to it.index }
        val stable = longestIncreasingSubsequence(newSequence.map { sourcePositions.getValue(it) }).map { newSequence[it] }.toSet()
        val sourceText = source.node.entries.filterIsInstance<DiffEntry.Text>().associateBy { it.logicalId }
        val targetText = target.node.entries.filterIsInstance<DiffEntry.Text>().associateBy { it.logicalId }
        for (id in newSequence.filter { it !in stable }) {
            val beforeRef = old.byId[id]?.ref ?: sourceText[id]?.let(source::textRef)
            val afterRef = fresh.byId[id]?.ref ?: targetText[id]?.let(target::textRef)
            if (beforeRef != null && afterRef != null) items.emit("move", listOf(beforeRef), listOf(afterRef))
        }
    }

    /** Entry kind decides which logical identity participates in sibling ordering. */
    private fun identities(parent: IndexedDiffNode): List<UUID> = parent.node.entries.mapNotNull { (it as? DiffEntry.Child)?.node?.logicalId ?: (it as? DiffEntry.Text)?.logicalId }

    /** Returns original indices with the historical lower-bound tie choice, including empty input. */
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
}

/** Orders findings by target location, anchored removals, facet priority and finally stable key. */
internal class DiffFindingOrdering(before: List<DiffNode>, after: List<DiffNode>) {
    private val beforePositions = positions(before)
    private val afterPositions = positions(after)

    /** First emission wins for duplicate keys before stable document ordering is applied. */
    fun sorted(items: List<DiffItem>): List<DiffItem> = items.distinctBy { it.key }.sortedWith { left, right ->
        val a = left.afterRefs.firstOrNull()?.let { order(it, true) } ?: order(left.beforeRefs.first(), false)
        val b = right.afterRefs.firstOrNull()?.let { order(it, true) } ?: order(right.beforeRefs.first(), false)
        comparePositions(a, b).takeIf { it != 0 }
            ?: (facetPriority(left.facet).compareTo(facetPriority(right.facet))).takeIf { it != 0 }
            ?: left.key.compareTo(right.key)
    }

    /** Removed paths anchor to the nearest surviving target ancestor, retaining old relative positions. */
    private fun order(ref: DiffRef, target: Boolean): List<Int> {
        val path = ref.pathLogicalIds
        if (target) return afterPositions[path] ?: emptyList()
        val anchor = (path.size downTo 1).firstOrNull { afterPositions.containsKey(path.take(it)) } ?: 0
        return afterPositions[path.take(anchor)].orEmpty() + beforePositions[path].orEmpty().drop((anchor - 1).coerceAtLeast(0))
    }

    /** Full logical paths distinguish occurrences under equally labelled ancestors. */
    private fun positions(roots: List<DiffNode>): Map<List<UUID>, List<Int>> {
        val result = mutableMapOf<List<UUID>, List<Int>>()

        /** Parent positions precede descendants; text and child nodes share the stored entry order. */
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
        roots.forEachIndexed { index, root -> visit(root, listOf(DiffTreeIndex.ROOT_ID), listOf(index)) }
        return result
    }

    /** A parent sorts before a descendant when their common positional prefix is equal. */
    private fun comparePositions(a: List<Int>, b: List<Int>): Int {
        for (index in 0 until minOf(a.size, b.size)) {
            val compared = a[index].compareTo(b[index])
            if (compared != 0) return compared
        }
        return a.size.compareTo(b.size)
    }

    /** Moves precede metadata, then all other facets at the same document position. */
    private fun facetPriority(facet: String): Int = when (facet) {
        "move" -> 0
        "metadata" -> 1
        else -> 2
    }
}

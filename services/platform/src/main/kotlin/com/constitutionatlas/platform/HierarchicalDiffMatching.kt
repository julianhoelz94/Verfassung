package com.constitutionatlas.platform

import java.util.UUID

/** Matching decisions retain group insertion order and unresolved target identities. */
internal data class DiffNodeMatches(
    val groups: List<Pair<List<IndexedDiffNode>, List<IndexedDiffNode>>>,
    val groupedOld: Set<UUID>,
    val groupedFresh: Set<UUID>,
    val pairs: Map<UUID, IndexedDiffNode>,
    val ambiguous: Set<UUID>,
)

/** One comparison's occurrence/revision groups and one-to-one logical matches. */
internal class DiffNodeMatcher(private val old: DiffTreeIndex, private val fresh: DiffTreeIndex) {
    private val groupedOld = mutableSetOf<UUID>()
    private val groupedFresh = mutableSetOf<UUID>()
    private val groups = mutableListOf<Pair<List<IndexedDiffNode>, List<IndexedDiffNode>>>()
    private val pairs = mutableMapOf<UUID, IndexedDiffNode>()
    private val ambiguous = mutableSetOf<UUID>()

    /** Occurrence splits take precedence over revision splits, then merges and ordinary matches. */
    fun match(): DiffNodeMatches {
        occurrenceSplits()
        revisionSplits()
        merges()
        pairTargets()
        return DiffNodeMatches(groups, groupedOld, groupedFresh, pairs, ambiguous)
    }

    /** Multiple targets explicitly naming one old occurrence form the first reviewed group. */
    private fun occurrenceSplits() {
        val targets = fresh.nodes.filter { it.node.predecessorId != null }.groupBy { it.node.predecessorId }
            .filter { (id, entries) -> id in old.byOccurrence && entries.size > 1 }
        for ((id, entries) in targets) addGroup(old.byOccurrence[id].orEmpty(), entries)
    }

    /** Revision groups skip overlaps with an earlier split, preserving the original precedence. */
    private fun revisionSplits() {
        val targets = fresh.nodes.flatMap { target -> target.node.lineage.map { it to target } }
            .groupBy({ it.first }, { it.second }).filter { (revision, entries) -> revision in old.byRevision && entries.size > 1 }
        for ((revision, entries) in targets) {
            val sources = old.byRevision[revision].orEmpty()
            if (sources.any { it.node.logicalId in groupedOld } || entries.any { it.node.logicalId in groupedFresh }) continue
            addGroup(sources, entries)
        }
    }

    /** Merge sources accept both revision and occurrence ancestry, deduplicating only logical identity. */
    private fun merges() {
        for (target in fresh.nodes) {
            val sources = target.node.lineage.flatMap { old.byRevision[it].orEmpty() + old.byOccurrence[it].orEmpty() }.distinctBy { it.node.logicalId }
            if (sources.size > 1 && target.node.logicalId !in groupedFresh) addGroup(sources, listOf(target))
        }
    }

    /** Records every grouped identity; merge groups may still reference an already grouped source. */
    private fun addGroup(sources: List<IndexedDiffNode>, targets: List<IndexedDiffNode>) {
        groups += sources to targets
        groupedOld += sources.map { it.node.logicalId }
        groupedFresh += targets.map { it.node.logicalId }
    }

    /** Prefer explicit predecessors; duplicate target IDs or multiple choices remain ambiguous. */
    private fun pairTargets() {
        val usedOld = mutableSetOf<UUID>()
        for (target in fresh.nodes) {
            if (target.node.logicalId in groupedFresh) continue
            val matches = old.byLogical[target.node.logicalId].orEmpty().filter { it.node.logicalId !in usedOld }
            val lineage = target.node.predecessorId?.let { old.byOccurrence[it].orEmpty() }.orEmpty().filter { it.node.logicalId !in usedOld }
            val choices = if (lineage.isNotEmpty()) lineage else matches
            if (choices.size == 1 && choices.single().node.logicalId !in groupedOld && fresh.logicalCounts[target.node.logicalId] == 1) {
                pairs[target.node.logicalId] = choices.single()
                usedOld += choices.single().node.logicalId
            } else if (choices.size > 1 || (fresh.logicalCounts[target.node.logicalId] ?: 0) > 1) {
                ambiguous += target.node.logicalId
            }
        }
    }
}

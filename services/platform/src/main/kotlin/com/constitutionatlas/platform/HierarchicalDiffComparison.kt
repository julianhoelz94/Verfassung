package com.constitutionatlas.platform

import java.security.MessageDigest

/** SHA-256 identity encoding is unchanged so stored review pins remain valid across this refactor. */
internal fun diffDigest(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

/** Collects findings in phase order before final key deduplication and document sorting. */
internal class DiffItemCollector {
    val items = mutableListOf<DiffItem>()

    /** Keys pin identities and facet; fingerprints additionally pin revisions, ancestry, paths and wording. */
    fun emit(facet: String, beforeRefs: List<DiffRef>, afterRefs: List<DiffRef>, isAmbiguous: Boolean = false, group: String? = null) {
        val identities = (beforeRefs + afterRefs).joinToString("|") { "${it.versionId}:${it.logicalId}:${it.kind}" }
        val key = diffDigest("${HierarchicalDiff.ALGORITHM_VERSION}|$facet|$identities")
        val fingerprint = diffDigest("$key|${(beforeRefs + afterRefs).joinToString("|") { "${it.revisionId}:${it.pathLogicalIds}:${it.path}:${it.excerpt}" }}")
        items += DiffItem(key, fingerprint, facet, (afterRefs.firstOrNull() ?: beforeRefs.first()).path.size - 1, beforeRefs, afterRefs, isAmbiguous, group)
    }
}

/** One run's matching and emission phases, with all mutable state confined to this comparison. */
internal class DiffComparison(private val old: DiffTreeIndex, private val fresh: DiffTreeIndex, private val skipSharedRevision: Boolean) {
    private val matches = DiffNodeMatcher(old, fresh).match()
    private val items = DiffItemCollector()

    /** Global text movement precedes grouped nodes, missing subtrees and matched-node details. */
    fun compare(): List<DiffItem> {
        val movedText = DiffTextComparison.crossParentMoves(old, fresh, matches, items)
        emitGroups()
        emitSubtrees()
        for (target in fresh.nodes) {
            val source = matches.pairs[target.node.logicalId] ?: continue
            comparePair(source, target, movedText)
        }
        return items.items
    }

    /** Node group keys depend on reference order, and all split/merge findings require review. */
    private fun emitGroups() {
        for ((sources, targets) in matches.groups) {
            val beforeRefs = sources.map { it.ref }
            val afterRefs = targets.map { it.ref }
            val group = diffDigest("group|${(beforeRefs + afterRefs).joinToString("|") { it.logicalId.toString() }}")
            items.emit(if (targets.size > 1) "split" else "merge", beforeRefs, afterRefs, true, group)
        }
    }

    /** A missing or new subtree emits its highest actionable ancestor, rather than every descendant. */
    private fun emitSubtrees() {
        val pairedOld = matches.pairs.values.map { it.node.logicalId }.toSet()
        for (source in old.nodes) {
            if (source.node.logicalId in pairedOld || source.node.logicalId in matches.groupedOld || source.ancestors.any { it !in pairedOld || it in matches.groupedOld }) continue
            items.emit("removed", listOf(source.ref), emptyList())
        }
        for (target in fresh.nodes) {
            if (target.node.logicalId in matches.pairs || target.node.logicalId in matches.groupedFresh || target.ancestors.any { it !in matches.pairs || it in matches.groupedFresh }) continue
            items.emit("added", emptyList(), listOf(target.ref), target.node.logicalId in matches.ambiguous)
        }
    }

    /** Parent moves are visible even when a shared revision lets callers skip content comparison. */
    private fun comparePair(source: IndexedDiffNode, target: IndexedDiffNode, movedText: Set<java.util.UUID>) {
        val sourceParent = source.ancestors.lastOrNull()
        val targetParent = target.ancestors.lastOrNull()
        if (sourceParent != targetParent?.let { matches.pairs[it]?.node?.logicalId ?: it }) items.emit("move", listOf(source.ref), listOf(target.ref))
        if (skipSharedRevision && source.node.revisionId != null && source.node.revisionId == target.node.revisionId) return
        if (source.node.kind != target.node.kind || source.node.label != target.node.label || source.node.title != target.node.title) {
            items.emit("metadata", listOf(source.ref), listOf(target.ref))
        }
        DiffTextMatch(source, target, movedText, items).compare()
        DiffSiblingOrdering.compare(source, target, old, fresh, items)
    }
}

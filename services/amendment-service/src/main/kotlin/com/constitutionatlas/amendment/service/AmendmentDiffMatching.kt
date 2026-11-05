package com.constitutionatlas.amendment.service

import java.util.UUID

/** Request-local three-phase pairing for legacy change rows; hierarchical review uses its own API. */
internal class AmendmentDiffMatching(private val source: List<FlatNode>) {
    private val sourceById = source.associateBy { it.id }
    private val unmatchedSource = source.map { it.id }.toMutableSet()
    private val ambiguousTargetIds = mutableSetOf<UUID>()
    private val pairs = mutableListOf<Pair<FlatNode, FlatNode>>()

    /** Predecessors win, then unique identity, then first legacy match; output stays added/changed/removed. */
    fun compare(target: List<FlatNode>): List<NodeChange> {
        val unmatchedTarget = matchPredecessors(target)
        val stillUnmatched = matchIdentities(unmatchedTarget)
        val addedTargets = matchLegacy(stillUnmatched)
        val added = addedTargets.map { NodeChange("added", it, ambiguous = it.id in ambiguousTargetIds) }
        val removed = source.filter { it.id in unmatchedSource }.map { NodeChange("removed", it, before = it) }
        val changed = pairs.filter { (from, to) -> changed(from, to) }.map { (from, to) -> NodeChange("changed", to, before = from) }
        return added + changed + removed
    }

    /** Uses the historical last-row ID lookup while consuming each source ID at most once. */
    private fun matchPredecessors(target: List<FlatNode>): List<FlatNode> {
        val unmatched = mutableListOf<FlatNode>()
        for (node in target) {
            val predecessor = node.predecessorId
            if (predecessor != null && predecessor in unmatchedSource && predecessor in sourceById) {
                pair(sourceById.getValue(predecessor), node)
            } else {
                unmatched += node
            }
        }
        return unmatched
    }

    /** Records ambiguous target IDs for eventual additions, including repeated target occurrences. */
    private fun matchIdentities(target: List<FlatNode>): List<FlatNode> {
        val unmatched = mutableListOf<FlatNode>()
        for (node in target) {
            val key = identityKey(node)
            val matches = source.filter { candidate -> candidate.id in unmatchedSource && sameIdentity(candidate, node, key) }
            val match = matches.singleOrNull()
            if (match != null) {
                pair(match, node)
            } else {
                if (matches.size > 1) ambiguousTargetIds += node.id
                unmatched += node
            }
        }
        return unmatched
    }

    /** Canonical logical IDs never pair by labels; only two explicitly legacy units may fall back. */
    private fun matchLegacy(target: List<FlatNode>): List<FlatNode> {
        val added = mutableListOf<FlatNode>()
        for (node in target) {
            val match = source.firstOrNull { candidate ->
                candidate.id in unmatchedSource && node.legacyIdentity && candidate.legacyIdentity && legacyKey(candidate) == legacyKey(node)
            }
            if (match != null) pair(match, node) else added += node
        }
        return added
    }

    /** Consumes an identity after recording its ordered source/target pair. */
    private fun pair(from: FlatNode, to: FlatNode) {
        pairs += from to to
        unmatchedSource.remove(from.id)
    }

    /** Nullable logical identities preserve the original separate canonical and legacy matching rules. */
    private fun sameIdentity(candidate: FlatNode, node: FlatNode, key: String): Boolean =
        if (node.logicalId != null) candidate.logicalId == node.logicalId else candidate.logicalId == null && identityKey(candidate) == key

    /** Shared immutable revisions suppress changes; distinct pinned revisions count even with equal text. */
    private fun changed(from: FlatNode, to: FlatNode): Boolean =
        if (from.logicalId != null && from.logicalId == to.logicalId && from.revisionId != null && from.revisionId == to.revisionId) {
            false
        } else if (from.logicalId != null && from.logicalId == to.logicalId && from.revisionId != null && to.revisionId != null) {
            true
        } else {
            textOf(from) != textOf(to)
        }

    /** Parent-aware paths prevent legacy text entries from pairing across distinct containers. */
    private fun legacyKey(node: FlatNode): String = "${node.articleNumber}\u0000${node.legacyPath ?: identityKey(node)}"

    /** Number wins over label; case folding retains the original default-locale-independent rule. */
    private fun identityKey(node: FlatNode): String = "${node.kind}\u0000${(node.number ?: node.label ?: "").lowercase()}"

    /** Title and body remain distinct fields and authored whitespace is significant. */
    private fun textOf(node: FlatNode): String = "${node.title.orEmpty()}\u0000${node.body.orEmpty()}"
}

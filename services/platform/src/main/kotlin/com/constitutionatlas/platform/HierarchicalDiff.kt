package com.constitutionatlas.platform

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
    data class Text(val logicalId: UUID, val revisionId: UUID?, val occurrenceId: UUID?, val text: String, val lineageRevisionIds: List<UUID> = emptyList(), val semantic: String? = null) : DiffEntry
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

/** Shared amendment/editor comparison with stable review identities and exact ordered text. */
object HierarchicalDiff {
    const val ALGORITHM_VERSION = "hierarchical-1"

    /**
     * Matches node/text ancestry before comparing local content and relative sibling order.
     * Results retain the existing key/fingerprint format and document ordering. Settings impact
     * is independent of content findings. Editor previews disable [skipSharedRevision] because
     * in-memory edits can retain a stored revision ID while their content changes.
     */
    fun compare(
        beforeVersionId: UUID?,
        before: List<DiffNode>,
        afterVersionId: UUID?,
        after: List<DiffNode>,
        beforeSettingsRevisionId: UUID? = null,
        afterSettingsRevisionId: UUID? = null,
        skipSharedRevision: Boolean = true,
    ): DiffRun {
        val old = DiffTreeIndex.create(before, beforeVersionId)
        val fresh = DiffTreeIndex.create(after, afterVersionId)
        val items = DiffComparison(old, fresh, skipSharedRevision).compare()
        return DiffRun(DiffFindingOrdering(before, after).sorted(items), beforeSettingsRevisionId != afterSettingsRevisionId)
    }
}

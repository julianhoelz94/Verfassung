package com.constitutionatlas.content.api

import java.util.UUID

typealias OrderedNode = com.constitutionatlas.platform.OrderedNode
typealias OrderedEntry = com.constitutionatlas.platform.OrderedEntry
typealias OrderedSnapshot = com.constitutionatlas.platform.OrderedSnapshot

typealias OrderedNodeWrite = com.constitutionatlas.platform.OrderedNodeWrite
typealias OrderedEntryWrite = com.constitutionatlas.platform.OrderedEntryWrite
typealias OrderedSnapshotWrite = com.constitutionatlas.platform.OrderedSnapshotWrite

data class ResolvedContent(
    val versionId: UUID,
    val constitutionId: UUID?,
    val logicalId: UUID,
    val revisionId: UUID,
    val occurrenceId: UUID,
    val rootOccurrenceId: UUID,
    val parentLogicalId: UUID?,
    val breadcrumbs: List<UUID>,
    val pathLabels: List<String>,
    val kind: String,
    val articleNumber: String?,
    val text: String,
    val deepLink: String,
)

typealias StrictContentWrite = com.constitutionatlas.platform.StrictOrderedWrite

data class OrderedContentExport(val versionId: UUID, val settingsRevisionId: UUID?, val roots: List<OrderedNodeWrite>)

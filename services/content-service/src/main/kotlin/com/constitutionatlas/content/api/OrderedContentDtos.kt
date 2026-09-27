package com.constitutionatlas.content.api

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.databind.JsonNode
import java.util.UUID

typealias OrderedNode = com.constitutionatlas.platform.OrderedNode
typealias OrderedEntry = com.constitutionatlas.platform.OrderedEntry
typealias OrderedSnapshot = com.constitutionatlas.platform.OrderedSnapshot

typealias OrderedNodeWrite = com.constitutionatlas.platform.OrderedNodeWrite
typealias OrderedEntryWrite = com.constitutionatlas.platform.OrderedEntryWrite
typealias OrderedSnapshotWrite = com.constitutionatlas.platform.OrderedSnapshotWrite

data class ResolvedContent(
    val versionId: UUID,
    val logicalId: UUID,
    val revisionId: UUID,
    val occurrenceId: UUID,
    val parentLogicalId: UUID?,
    val breadcrumbs: List<UUID>,
    val kind: String,
    val text: String,
    val deepLink: String,
)

open class StrictContentWrite {
    @JsonAnySetter
    fun rejectUnknown(name: String, value: JsonNode): Unit = throw IllegalArgumentException("Unexpected content field '$name'")
}

data class OrderedContentExport(val versionId: UUID, val settingsRevisionId: UUID?, val roots: List<OrderedNodeWrite>)

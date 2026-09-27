package com.constitutionatlas.content.api

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.databind.JsonNode
import java.util.UUID

data class OrderedNode(
    val logicalId: UUID,
    val revisionId: UUID,
    val occurrenceId: UUID,
    val kind: String,
    val label: String?,
    val title: String?,
    val content: List<OrderedEntry>,
    val orderInferred: Boolean = false,
)

data class OrderedEntry(
    val type: String,
    val node: OrderedNode? = null,
    val logicalId: UUID? = null,
    val revisionId: UUID? = null,
    val occurrenceId: UUID? = null,
    val text: String? = null,
)

data class OrderedSnapshot(
    val versionId: UUID,
    val generation: Long,
    val settingsRevisionId: UUID?,
    val roots: List<OrderedNode>,
)

data class OrderedNodeWrite(
    val revisionId: UUID? = null,
    val logicalId: UUID? = null,
    val predecessorRevisionId: UUID? = null,
    val kind: String? = null,
    val label: String? = null,
    val title: String? = null,
    val content: List<OrderedEntryWrite>? = null,
) : StrictContentWrite()

data class OrderedEntryWrite(
    val type: String,
    val node: OrderedNodeWrite? = null,
    val revisionId: UUID? = null,
    val logicalId: UUID? = null,
    val predecessorRevisionId: UUID? = null,
    val text: String? = null,
    val lineage: List<UUID> = emptyList(),
) : StrictContentWrite()

data class OrderedSnapshotWrite(
    val expectedGeneration: Long,
    val sourceVersionId: UUID? = null,
    val sourceGeneration: Long? = null,
    val roots: List<OrderedNodeWrite>,
) : StrictContentWrite()

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

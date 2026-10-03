package com.constitutionatlas.platform

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.JsonNode
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class OrderedNode(
    val logicalId: UUID,
    val revisionId: UUID,
    val occurrenceId: UUID,
    val kind: String,
    val label: String?,
    val title: String?,
    val content: List<OrderedEntry>,
    val orderInferred: Boolean = false,
    @get:JsonInclude(JsonInclude.Include.NON_EMPTY)
    val lineage: List<UUID> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class OrderedEntry(
    val type: String,
    val node: OrderedNode? = null,
    val logicalId: UUID? = null,
    val revisionId: UUID? = null,
    val occurrenceId: UUID? = null,
    val text: String? = null,
    @get:JsonInclude(JsonInclude.Include.NON_EMPTY)
    val lineage: List<UUID> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class OrderedSnapshot(
    val versionId: UUID,
    val generation: Long,
    val settingsRevisionId: UUID?,
    val roots: List<OrderedNode>,
)

/** Traversal preserves stored order and exact text bytes. Headings are metadata, not body text. */
object OrderedContentText {
    fun entries(content: List<OrderedEntry>): String = buildString {
        var previousChild = false
        for (entry in content) {
            val child = entry.type == "child"
            val part = when (entry.type) {
                "text" -> requireNotNull(entry.text) { "Ordered text entry has no text" }
                "child" -> entries(requireNotNull(entry.node) { "Ordered child entry has no node" }.content)
                else -> throw IllegalArgumentException("Unknown ordered entry type '${entry.type}'")
            }
            if (part.isEmpty()) continue
            if (isNotEmpty() && (child || previousChild) && !last().isWhitespace() && !part.first().isWhitespace()) append(' ')
            append(part)
            previousChild = child
        }
    }
}

data class OrderedNodeWrite(
    val revisionId: UUID? = null,
    val logicalId: UUID? = null,
    val predecessorRevisionId: UUID? = null,
    val kind: String? = null,
    val label: String? = null,
    val title: String? = null,
    val content: List<OrderedEntryWrite>? = null,
    val lineage: List<UUID> = emptyList(),
) : StrictOrderedWrite()

data class OrderedEntryWrite(
    val type: String,
    val node: OrderedNodeWrite? = null,
    val revisionId: UUID? = null,
    val logicalId: UUID? = null,
    val predecessorRevisionId: UUID? = null,
    val text: String? = null,
    val lineage: List<UUID> = emptyList(),
) : StrictOrderedWrite()

data class OrderedSnapshotWrite(
    val expectedGeneration: Long,
    val sourceVersionId: UUID? = null,
    val sourceGeneration: Long? = null,
    val roots: List<OrderedNodeWrite>,
    val publishAttemptId: UUID? = null,
) : StrictOrderedWrite()

open class StrictOrderedWrite {
    @JsonAnySetter
    fun rejectUnknown(name: String, value: JsonNode): Unit = throw IllegalArgumentException("Unexpected content field '$name'")
}

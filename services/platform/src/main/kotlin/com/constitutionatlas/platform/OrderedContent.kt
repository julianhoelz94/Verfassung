package com.constitutionatlas.platform

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
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
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class OrderedEntry(
    val type: String,
    val node: OrderedNode? = null,
    val logicalId: UUID? = null,
    val revisionId: UUID? = null,
    val occurrenceId: UUID? = null,
    val text: String? = null,
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
    fun entries(content: List<OrderedEntry>): String = join(content.map { entry ->
        when (entry.type) {
            "text" -> requireNotNull(entry.text) { "Ordered text entry has no text" }
            "child" -> entries(requireNotNull(entry.node) { "Ordered child entry has no node" }.content)
            else -> throw IllegalArgumentException("Unknown ordered entry type '${entry.type}'")
        }
    })

    /** Add a boundary space only when both fragments lack whitespace at that boundary. */
    fun join(parts: List<String>): String = buildString {
        for (part in parts) {
            if (part.isEmpty()) continue
            if (isNotEmpty() && !last().isWhitespace() && !part.first().isWhitespace()) append(' ')
            append(part)
        }
    }
}

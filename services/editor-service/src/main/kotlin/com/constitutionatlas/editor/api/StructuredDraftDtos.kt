package com.constitutionatlas.editor.api

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class DraftNode(
    val logicalId: UUID,
    val revisionId: UUID? = null,
    val draftId: UUID? = null,
    val kind: String,
    val label: String? = null,
    val title: String? = null,
    val content: List<DraftEntry>,
    val occurrenceId: UUID? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class DraftEntry(
    val type: String,
    val node: DraftNode? = null,
    val logicalId: UUID? = null,
    val revisionId: UUID? = null,
    val draftId: UUID? = null,
    val text: String? = null,
    val occurrenceId: UUID? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class DraftSource(val versionId: UUID, val generation: Long, val settingsRevisionId: UUID?, val roots: List<DraftNode>)

data class TextPart(val logicalId: UUID, val text: String)

data class DraftOperation(
    val id: UUID,
    val type: String,
    val targetId: UUID,
    val expectedRevisionId: UUID,
    val text: String? = null,
    val title: String? = null,
    val label: String? = null,
    val position: Int? = null,
    val destinationParentId: UUID? = null,
    val destinationRevisionId: UUID? = null,
    val parts: List<TextPart> = emptyList(),
    val mergeIds: List<UUID> = emptyList(),
    val node: DraftNode? = null,
)

data class StructuredDraftSave(val expectedGeneration: Long, val operations: List<DraftOperation>)

data class StructuredDraftPreview(
    val sessionId: UUID,
    val sourceVersionId: UUID,
    val sourceGeneration: Long,
    val settingsRevisionId: UUID,
    val generation: Long,
    val sourceRootRevisionIds: List<UUID>,
    val operations: List<DraftOperation>,
    val roots: List<DraftNode>,
    val sourceRoots: List<DraftNode> = emptyList(),
)

package com.constitutionatlas.editor.api

import java.util.UUID

data class Actor(
    val id: UUID,
    val email: String,
    val roles: List<String>,
)

data class CreateSessionRequest(
    val versionId: UUID,
)

data class SaveDraftRequest(
    val articleId: UUID?,
    val title: String?,
    val body: String?,
)

data class EditSessionDto(
    val id: UUID,
    val actorId: UUID,
    val versionId: UUID,
    val status: String,
    val revisionCount: Int,
)

data class DraftPreviewDto(
    val session: EditSessionDto,
    val latestSnapshot: String?,
)

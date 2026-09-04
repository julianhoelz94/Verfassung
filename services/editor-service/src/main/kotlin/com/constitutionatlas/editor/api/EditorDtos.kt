package com.constitutionatlas.editor.api

import java.util.UUID

data class Actor(
    val id: UUID,
    val email: String,
    val roles: List<String>,
)

fun Actor.isAdmin(): Boolean = "admin" in roles

fun Actor.canEdit(): Boolean = isAdmin() || "editor" in roles

fun Actor.canReview(): Boolean = isAdmin() || "reviewer" in roles

fun Actor.canPublish(): Boolean = isAdmin() || "publisher" in roles

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

data class DraftArticleDto(
    val articleId: UUID,
    val title: String,
    val body: String,
)

data class DraftPreviewDto(
    val session: EditSessionDto,
    val latestSnapshot: String?,
    val drafts: List<DraftArticleDto> = emptyList(),
    val publicContentUpdated: Boolean? = null,
)

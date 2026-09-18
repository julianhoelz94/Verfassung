package com.constitutionatlas.editor.api

import com.constitutionatlas.platform.Actor
import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonValue
import java.time.Instant
import java.util.UUID

fun Actor.isAdmin(): Boolean = "admin" in roles

fun Actor.canEdit(): Boolean = isAdmin() || "editor" in roles

fun Actor.canReview(): Boolean = isAdmin() || "reviewer" in roles

fun Actor.canPublish(): Boolean = isAdmin() || "publisher" in roles

fun Actor.isEditorial(): Boolean = canEdit() || canReview() || canPublish()

enum class EditSessionStatus {
    OPEN,
    REVIEWING,
    APPROVED,
    PUBLISHED,
    ;

    @JsonValue
    fun toJson(): String = name.lowercase()

    companion object {
        val inProgress: List<EditSessionStatus> = listOf(OPEN, REVIEWING, APPROVED)

        fun fromDb(value: String): EditSessionStatus =
            entries.find { it.toJson() == value.lowercase() }
                ?: throw IllegalArgumentException("Unknown session status '$value'")

        @JvmStatic
        @JsonCreator
        fun fromJson(value: String): EditSessionStatus = fromDb(value)
    }
}

data class CreateSessionRequest(
    val versionId: UUID,
    val hopKind: String? = null,
)

data class SaveDraftRequest(
    val articleId: UUID?,
    val title: String?,
    val body: String?,
)

data class PublishRequest(
    val hopKind: String,
    val amendmentId: UUID? = null,
    val comment: String? = null,
    val changeRecord: ChangeRecordRequest? = null,
)

data class ChangeRecordRequest(
    val title: String,
    val comment: String,
    val documents: List<ChangeRecordDocument> = emptyList(),
    val changes: List<ChangeRecordChange> = emptyList(),
)

data class ChangeRecordChange(
    val articleId: UUID,
    val articleNumber: String,
    val changeType: String = "changed",
)

data class ChangeRecordDocument(
    val url: String? = null,
    val fileId: String? = null,
    val label: String? = null,
)

data class PublishDetailsRequest(
    val comment: String? = null,
    val changeRecord: ChangeRecordRequest? = null,
)

data class EditSessionDto(
    val id: UUID,
    val actorId: UUID,
    val versionId: UUID,
    val status: EditSessionStatus,
    val revisionCount: Int,
    val hopKind: String? = null,
)

data class EditSessionSummaryDto(
    val id: UUID,
    val versionId: UUID,
    val status: EditSessionStatus,
    val openedBy: UUID,
    val openedAt: Instant,
    val updatedAt: Instant,
    val changedArticleCount: Int,
    val hopKind: String? = null,
)

data class DraftArticleDto(
    val articleId: UUID,
    val title: String,
    val body: String,
)

enum class SearchIndexStatus {
    PENDING,
    READY,
    FAILED,
    ;

    @JsonValue
    fun toJson(): String = name.lowercase()
}

data class DraftPreviewDto(
    val session: EditSessionDto,
    val latestSnapshot: String?,
    val drafts: List<DraftArticleDto> = emptyList(),
    val publicContentUpdated: Boolean? = null,
    val sourceVersionId: UUID? = null,
    val newVersionId: UUID? = null,
    val newVersionLabel: String? = null,
    val searchIndexStatus: SearchIndexStatus? = null,
    val publishComment: String? = null,
    val changeRecord: ChangeRecordRequest? = null,
    val amendmentStatus: SearchIndexStatus? = null,
)

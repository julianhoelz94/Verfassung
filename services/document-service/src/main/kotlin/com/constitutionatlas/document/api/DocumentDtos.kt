package com.constitutionatlas.document.api

import java.time.OffsetDateTime
import java.util.UUID

data class DocumentDto(
    val id: UUID,
    val currentRevision: Int,
    val status: String,
    val createdAt: OffsetDateTime,
    val revision: DocumentRevisionDto,
)

data class DocumentRevisionDto(
    val id: UUID,
    val documentId: UUID,
    val revision: Int,
    val title: String,
    val description: String?,
    val sourceUrl: String?,
    val fileName: String?,
    val contentType: String?,
    val createdAt: OffsetDateTime,
    val createdBy: UUID,
)

data class SaveDocumentRequest(
    val title: String,
    val description: String? = null,
    val sourceUrl: String? = null,
    val expectedRevision: Int? = null,
)

data class DocumentEventDto(
    val id: UUID,
    val documentId: UUID,
    val eventType: String,
    val actorId: UUID,
    val occurredAt: OffsetDateTime,
    val revisionId: UUID?,
)

data class LinkRequest(
    val documentId: UUID,
    val revisionId: UUID? = null,
    val scopeRevisionId: UUID? = null,
)

data class DocumentLinkDto(
    val documentId: UUID,
    val revisionId: UUID?,
    val document: DocumentDto,
)

data class DocumentLinkEventDto(
    val id: UUID,
    val targetType: String,
    val targetId: UUID,
    val documentId: UUID,
    val revisionId: UUID?,
    val scopeRevisionId: UUID?,
    val action: String,
    val actorId: UUID,
    val occurredAt: OffsetDateTime,
)

package com.constitutionatlas.document.api

import java.time.OffsetDateTime
import java.util.UUID

data class DocumentDto(
    val id: UUID,
    val currentRevision: Int,
    val status: String,
    val createdAt: OffsetDateTime,
    val revision: DocumentRevisionDto,
    val citationKey: String = revision.citationKey,
    val tags: List<DocumentTagDto> = emptyList(),
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
    val citationKey: String = "",
    val bibliography: BibliographyDto = BibliographyDto(),
    val attachments: List<DocumentAttachmentDto> = emptyList(),
)

data class SaveDocumentRequest(
    val title: String,
    val description: String? = null,
    val sourceUrl: String? = null,
    val expectedRevision: Int? = null,
    val citationKey: String? = null,
    val bibliography: BibliographyDto? = null,
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

data class ReviseMaterialRequest(
    val title: String,
    val description: String? = null,
    val sourceUrl: String? = null,
    val expectedRevision: Int,
    val expectedLinkedRevisionId: UUID,
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

data class CreatorDto(val family: String? = null, val given: String? = null, val literal: String? = null)

data class BibliographyDto(
    val type: String = "misc",
    val authors: List<CreatorDto> = emptyList(),
    val editors: List<CreatorDto> = emptyList(),
    val issued: String? = null,
    val containerTitle: String? = null,
    val publisher: String? = null,
    val volume: String? = null,
    val issue: String? = null,
    val pages: String? = null,
    val doi: String? = null,
    val isbn: String? = null,
    val language: String? = null,
    val abstract: String? = null,
    val extra: Map<String, String> = emptyMap(),
)

data class DocumentTagDto(val id: UUID, val name: String)

data class DocumentFolderDto(val id: UUID, val name: String, val tagId: UUID)

data class DocumentPageDto(val items: List<DocumentDto>, val total: Int, val offset: Int, val limit: Int)

data class DocumentAttachmentDto(
    val id: UUID,
    val fileName: String,
    val contentType: String,
    val size: Long,
    val sha256: String,
    val primary: Boolean,
)

package com.constitutionatlas.catalog.api

import java.time.OffsetDateTime
import java.util.UUID

data class WikiCitation(val documentId: UUID, val revision: Int, val title: String, val citationNote: String? = null)

data class WikiImage(
    val documentId: UUID,
    val revision: Int,
    val alt: String,
    val caption: String? = null,
    val credit: String? = null,
    val sourceUrl: String? = null,
    val rights: String? = null,
    val placement: String = "after_body",
)

data class WikiPageRevision(
    val id: UUID,
    val targetType: String,
    val targetId: UUID,
    val predecessorId: UUID?,
    val summary: String,
    val body: String,
    val images: List<WikiImage>,
    val sourceUrls: List<String> = emptyList(),
    val createdAt: OffsetDateTime? = null,
    val createdBy: UUID? = null,
    val publishedAt: OffsetDateTime? = null,
    val citations: List<WikiCitation> = emptyList(),
)

data class SaveWikiPage(
    val expectedRevisionId: UUID? = null,
    val summary: String,
    val body: String,
    val images: List<WikiImage> = emptyList(),
    val sourceUrls: List<String> = emptyList(),
    val citations: List<WikiCitation> = emptyList(),
    val operationId: UUID? = null,
)

data class PublishWikiPage(val revisionId: UUID)

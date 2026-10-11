package com.constitutionatlas.document.api

import java.time.OffsetDateTime
import java.util.UUID

data class LegalPageRevisionDto(
    val revision: Int,
    val content: String,
    val createdAt: OffsetDateTime,
    val createdBy: UUID,
)

data class LegalPageStateDto(
    val key: String,
    val draft: LegalPageRevisionDto?,
    val published: LegalPageRevisionDto?,
)

data class SaveLegalPageDraftRequest(
    val content: String,
    val expectedRevision: Int,
)

data class PublishLegalPageRequest(val expectedRevision: Int)

package com.constitutionatlas.document.api

import java.time.OffsetDateTime
import java.util.UUID

data class LegalPageRevisionDto(
    val revision: Int,
    val content: String,
    val createdAt: OffsetDateTime,
    val createdBy: UUID,
    val separateContact: Boolean = false,
)

data class LegalPageStateDto(
    val key: String,
    val draft: LegalPageRevisionDto?,
    val published: LegalPageRevisionDto?,
)

data class SaveLegalPageDraftRequest(
    val content: String,
    val expectedRevision: Int,
    val contact: SaveImprintDetailsRequest? = null,
)

data class PublishLegalPageRequest(val expectedRevision: Int, val expectedContactRevision: Int? = null)

data class ImprintDetailsDto(
    val revision: Int,
    val name: String,
    val streetAddress: String,
    val postalCode: String,
    val city: String,
    val country: String,
    val email: String,
)

data class ImprintDetailsStateDto(
    val draft: ImprintDetailsDto?,
    val published: ImprintDetailsDto?,
    val managedFields: List<String> = emptyList(),
)

data class SaveImprintDetailsRequest(
    val expectedRevision: Int,
    val name: String,
    val streetAddress: String,
    val postalCode: String,
    val city: String,
    val country: String,
    val email: String,
)

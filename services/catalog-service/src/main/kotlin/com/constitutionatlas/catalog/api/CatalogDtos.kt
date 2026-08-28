package com.constitutionatlas.catalog.api

import java.time.LocalDate
import java.util.UUID

data class CountrySummary(
    val id: UUID,
    val isoCode: String,
    val name: String,
)

data class VersionSummary(
    val id: UUID,
    val versionLabel: String,
    val effectiveDate: LocalDate?,
    val languageCode: String,
    val sourceUrl: String?,
    val gazetteReference: String?,
)

data class NodeKindDto(
    val kindCode: String,
    val displayLabel: String,
    val sortOrder: Int,
    val mayHoldText: Boolean,
    val mayHoldChildren: Boolean,
    val allowedChildKinds: List<String>,
)

data class ContentOutlineDto(
    val kinds: List<NodeKindDto>,
)

data class ConstitutionSummary(
    val id: UUID,
    val slug: String,
    val title: String,
    val versions: List<VersionSummary>,
    val contentOutline: ContentOutlineDto,
)

data class CountryDetail(
    val id: UUID,
    val isoCode: String,
    val name: String,
    val constitutions: List<ConstitutionSummary>,
)

data class CreateCountryRequest(
    val isoCode: String,
    val name: String,
)

data class CreateConstitutionRequest(
    val slug: String,
    val title: String,
)

data class CreateVersionRequest(
    val versionLabel: String,
    val effectiveDate: LocalDate? = null,
    val languageCode: String = "en",
    val sourceUrl: String? = null,
    val gazetteReference: String? = null,
)

data class VersionCreated(
    val id: UUID,
    val constitutionId: UUID,
    val versionLabel: String,
    val publicationStatus: String,
)

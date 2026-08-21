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

data class ConstitutionSummary(
    val id: UUID,
    val slug: String,
    val title: String,
    val versions: List<VersionSummary>,
)

data class CountryDetail(
    val id: UUID,
    val isoCode: String,
    val name: String,
    val constitutions: List<ConstitutionSummary>,
)

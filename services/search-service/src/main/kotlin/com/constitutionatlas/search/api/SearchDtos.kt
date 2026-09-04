package com.constitutionatlas.search.api

import java.time.LocalDate
import java.util.UUID

data class SearchHit(
    val articleId: UUID,
    val versionId: UUID,
    val countryCode: String,
    val constitutionTitle: String,
    val versionLabel: String,
    val effectiveDate: LocalDate?,
    val articleNumber: String,
    val title: String,
    val snippet: String,
    val rank: Double,
)

data class SearchQuery(
    val text: String,
    val countryCode: String? = null,
    val versionId: UUID? = null,
    val effectiveDate: LocalDate? = null,
    val limit: Int = 20,
)

data class CountryFacet(
    val code: String,
    val count: Int,
)

data class VersionFacet(
    val id: UUID,
    val label: String,
    val constitutionTitle: String,
    val countryCode: String,
    val count: Int,
)

data class DateFacet(
    val effectiveDate: LocalDate,
    val count: Int,
)

data class SearchFacets(
    val countries: List<CountryFacet>,
    val versions: List<VersionFacet>,
    val dates: List<DateFacet>,
)

data class ReindexResult(
    val documentCount: Int,
    val status: String,
)

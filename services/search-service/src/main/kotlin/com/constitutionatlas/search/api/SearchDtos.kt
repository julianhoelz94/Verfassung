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
    val jurisdictionId: UUID? = null,
    val jurisdictionName: String? = null,
    val historical: Boolean = false,
)

data class SearchPage(
    val hits: List<SearchHit>,
    val total: Int,
    val limit: Int,
    val offset: Int,
    val indexGeneration: Long = 0,
)

data class SearchQuery(
    val text: String,
    val countryCode: String? = null,
    val versionId: UUID? = null,
    val effectiveDate: LocalDate? = null,
    val limit: Int = 20,
    val offset: Int = 0,
    val jurisdictionId: UUID? = null,
)

data class CountryFacet(
    val code: String,
    val countryName: String,
    val count: Int,
)

data class VersionFacet(
    val id: UUID,
    val label: String,
    val constitutionTitle: String,
    val countryCode: String,
    val count: Int,
    val jurisdictionId: UUID? = null,
)

data class DateFacet(
    val effectiveDate: LocalDate,
    val count: Int,
)

data class SearchFacets(
    val countries: List<CountryFacet>,
    val versions: List<VersionFacet>,
    val dates: List<DateFacet>,
    val jurisdictions: List<JurisdictionFacet> = emptyList(),
)

data class JurisdictionFacet(val id: UUID, val name: String, val historical: Boolean, val count: Int, val countryCode: String = "")

data class ReindexResult(
    val documentCount: Int,
    val status: String,
)

package com.constitutionatlas.ingestion.api

import java.time.LocalDate
import java.util.UUID

data class ImportArticle(
    val articleNumber: String,
    val title: String,
    val body: String,
    val sortOrder: Int,
)

data class ImportRequest(
    val isoCode: String,
    val countryName: String,
    val constitutionSlug: String,
    val constitutionTitle: String,
    val versionLabel: String,
    val effectiveDate: LocalDate? = null,
    val languageCode: String = "en",
    val sourceUrl: String? = null,
    val gazetteReference: String? = null,
    val articles: List<ImportArticle>,
)

data class ImportErrorDto(
    val code: String,
    val message: String,
)

data class ImportJobDto(
    val id: UUID,
    val status: String,
    val versionId: UUID?,
    val errors: List<ImportErrorDto>,
)

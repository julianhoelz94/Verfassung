package com.constitutionatlas.ingestion.api

import java.time.LocalDate
import java.util.UUID

data class ImportNode(
    val kind: String,
    val label: String? = null,
    val title: String? = null,
    val body: String? = null,
    val children: List<ImportNode> = emptyList(),
)

data class ImportArticle(
    val articleNumber: String,
    val title: String,
    val body: String = "",
    val sortOrder: Int,
    val nodes: List<ImportNode> = emptyList(),
)

data class ImportOutlineKind(
    val kindCode: String,
    val displayLabel: String,
    val presentation: String = "section",
    val showLabel: Boolean = true,
    val showTitle: Boolean = false,
    val showKind: Boolean = false,
)

data class ImportOutline(
    val kinds: List<ImportOutlineKind> = emptyList(),
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
    val outline: ImportOutline? = null,
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
    val isoCode: String? = null,
)

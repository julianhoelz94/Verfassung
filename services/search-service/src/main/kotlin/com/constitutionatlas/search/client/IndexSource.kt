package com.constitutionatlas.search.client

import java.time.LocalDate
import java.util.UUID

data class IndexableArticle(
    val articleId: UUID,
    val versionId: UUID,
    val countryCode: String,
    val constitutionTitle: String,
    val versionLabel: String,
    val effectiveDate: LocalDate?,
    val articleNumber: String,
    val title: String,
    val body: String,
)

fun interface IndexSource {
    fun loadPublishedArticles(): List<IndexableArticle>
}

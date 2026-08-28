package com.constitutionatlas.search.api

import java.util.UUID

data class SearchHit(
    val articleId: UUID,
    val versionId: UUID,
    val countryCode: String,
    val articleNumber: String,
    val title: String,
    val snippet: String,
    val rank: Double,
)

data class ReindexResult(
    val documentCount: Int,
    val status: String,
)

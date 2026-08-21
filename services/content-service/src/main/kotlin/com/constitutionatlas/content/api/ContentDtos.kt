package com.constitutionatlas.content.api

import java.util.UUID

data class ArticleSummary(
    val id: UUID,
    val versionId: UUID,
    val articleNumber: String,
    val title: String,
    val sortOrder: Int,
)

data class ArticleDetail(
    val id: UUID,
    val versionId: UUID,
    val articleNumber: String,
    val title: String,
    val body: String,
    val sortOrder: Int,
)

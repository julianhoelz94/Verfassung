package com.constitutionatlas.content.api

import java.util.UUID

data class ArticleSummary(
    val id: UUID,
    val versionId: UUID,
    val articleNumber: String,
    val title: String,
    val sortOrder: Int,
)

data class ContentNodeDto(
    val id: UUID,
    val kind: String,
    val label: String?,
    val number: String?,
    val title: String?,
    val body: String?,
    val sortOrder: Int,
    val children: List<ContentNodeDto>,
)

data class ArticleDetail(
    val id: UUID,
    val versionId: UUID,
    val articleNumber: String,
    val title: String,
    val body: String,
    val sortOrder: Int,
    val kind: String = "article",
    val children: List<ContentNodeDto> = emptyList(),
)

data class ArticleWrite(
    val articleNumber: String,
    val title: String,
    val body: String,
    val sortOrder: Int,
)

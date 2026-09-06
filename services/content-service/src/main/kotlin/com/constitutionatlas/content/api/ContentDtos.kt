package com.constitutionatlas.content.api

import com.fasterxml.jackson.annotation.JsonInclude
import java.util.UUID

@JsonInclude(JsonInclude.Include.NON_NULL)
data class ArticleSummary(
    val id: UUID,
    val versionId: UUID,
    val articleNumber: String,
    val title: String,
    val sortOrder: Int,
    val body: String? = null,
    val children: List<ContentNodeDto>? = null,
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

data class NodeWrite(
    val kind: String,
    val label: String? = null,
    val title: String? = null,
    val body: String? = null,
    val children: List<NodeWrite> = emptyList(),
)

data class ArticleWrite(
    val articleNumber: String,
    val title: String,
    val body: String = "",
    val sortOrder: Int,
    val nodes: List<NodeWrite> = emptyList(),
)

data class ArticlePatch(
    val title: String,
    val body: String,
)

data class RestructureRequest(
    val keepKinds: List<String>,
)

data class NodePatch(
    val title: String? = null,
)

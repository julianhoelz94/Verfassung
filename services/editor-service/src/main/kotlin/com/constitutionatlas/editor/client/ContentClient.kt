package com.constitutionatlas.editor.client

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class ContentTreeNode(
    val kind: String,
    val label: String? = null,
    val number: String? = null,
    val title: String? = null,
    val body: String? = null,
    val children: List<ContentTreeNode> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ContentTreeArticle(
    val id: UUID,
    val versionId: UUID,
    val articleNumber: String,
    val title: String,
    val sortOrder: Int,
    val body: String? = null,
    val children: List<ContentTreeNode> = emptyList(),
)

data class ArticleWritePayload(
    val articleNumber: String,
    val title: String,
    val body: String = "",
    val sortOrder: Int,
    val nodes: List<NodeWritePayload> = emptyList(),
)

data class NodeWritePayload(
    val kind: String,
    val label: String? = null,
    val title: String? = null,
    val body: String? = null,
    val children: List<NodeWritePayload> = emptyList(),
)

interface ContentClient {
    fun listArticles(versionId: UUID): List<ContentTreeArticle>

    fun replaceArticles(versionId: UUID, articles: List<ArticleWritePayload>)

    fun updateArticle(articleId: UUID, title: String, body: String)
}

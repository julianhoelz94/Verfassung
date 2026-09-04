package com.constitutionatlas.editor.client

import java.util.UUID

data class ContentArticle(
    val id: UUID,
    val versionId: UUID,
    val title: String,
    val body: String,
)

interface ContentClient {
    fun getArticle(articleId: UUID): ContentArticle

    fun updateArticle(articleId: UUID, title: String, body: String)
}

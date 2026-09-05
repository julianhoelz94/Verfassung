package com.constitutionatlas.content.service

import com.constitutionatlas.content.NotFoundException
import com.constitutionatlas.content.api.ArticleDetail
import com.constitutionatlas.content.api.ArticleSummary
import com.constitutionatlas.content.api.ArticleWrite
import com.constitutionatlas.content.api.ContentNodeDto
import com.constitutionatlas.content.repo.ArticleRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class ArticleQueryService(private val articleRepository: ArticleRepository) {
    fun listByVersion(
        versionId: UUID,
        offset: Int = 0,
        limit: Int? = null,
        includeBody: Boolean = false,
    ): List<ArticleSummary> {
        val items = articleRepository.listByVersion(versionId, offset, limit, includeBody)
        if (!includeBody) {
            return items
        }
        return items.map { item ->
            val children = articleRepository.listChildren(item.id)
            val body = if (children.isNotEmpty()) ArticleRepository.flattenText(children) else item.body
            item.copy(body = body, children = children)
        }
    }

    fun countByVersion(versionId: UUID): Int = articleRepository.countByVersion(versionId)

    fun getById(id: UUID): ArticleDetail {
        val article = articleRepository.findById(id) ?: throw NotFoundException("Unknown article '$id'")
        val children = articleRepository.listChildren(id)
        val body = if (children.isNotEmpty()) ArticleRepository.flattenText(children) else article.body
        return article.copy(body = body, children = children)
    }

    @Transactional
    fun replaceForVersion(versionId: UUID, articles: List<ArticleWrite>): List<ArticleSummary> {
        val numbers = articles.map { it.articleNumber.trim() }
        if (numbers.toSet().size != numbers.size) {
            throw IllegalArgumentException("articleNumber values must be unique")
        }
        val orders = articles.map { it.sortOrder }
        if (orders.toSet().size != orders.size) {
            throw IllegalArgumentException("sortOrder values must be unique")
        }
        return articleRepository.replaceForVersion(versionId, articles)
    }

    @Transactional
    fun updateText(id: UUID, title: String, body: String): ArticleDetail {
        if (title.isBlank()) {
            throw IllegalArgumentException("title must not be blank")
        }
        val children = articleRepository.listChildren(id)
        val flattened = ArticleRepository.flattenText(children)
        val keepTree = children.isNotEmpty() && body.trim() == flattened.trim()
        articleRepository.updateText(id, title, body, replaceChildren = !keepTree)
            ?: throw NotFoundException("Unknown article '$id'")
        return getById(id)
    }

    @Transactional
    fun updateNodeTitle(id: UUID, title: String?): ContentNodeDto = articleRepository.updateNodeTitle(id, title)
        ?: throw NotFoundException("Unknown node '$id'")

    @Transactional
    fun restructure(versionId: UUID, keepKinds: List<String>): Int {
        val kinds = keepKinds.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (kinds.isEmpty()) {
            throw IllegalArgumentException("keepKinds must not be empty")
        }
        return articleRepository.restructureKeepingKinds(versionId, kinds)
    }
}

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
        return items.map { attachChildren(it) }
    }

    fun countByVersion(versionId: UUID): Int = articleRepository.countByVersion(versionId)

    fun getById(id: UUID): ArticleDetail {
        val article = articleRepository.findById(id) ?: throw NotFoundException("Unknown article '$id'")
        return attachChildren(article)
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
        val flattened = projectedBody(null, children).orEmpty()
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

    private fun attachChildren(item: ArticleSummary): ArticleSummary {
        val children = articleRepository.listChildren(item.id)
        return item.copy(body = projectedBody(item.body, children), children = children)
    }

    private fun attachChildren(article: ArticleDetail): ArticleDetail {
        val children = articleRepository.listChildren(article.id)
        return article.copy(body = projectedBody(article.body, children).orEmpty(), children = children)
    }

    private fun projectedBody(stored: String?, children: List<ContentNodeDto>): String? =
        if (children.isNotEmpty()) ArticleRepository.flattenText(children) else stored
}

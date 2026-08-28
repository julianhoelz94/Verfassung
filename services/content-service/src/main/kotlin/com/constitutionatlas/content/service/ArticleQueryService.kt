package com.constitutionatlas.content.service

import com.constitutionatlas.content.NotFoundException
import com.constitutionatlas.content.api.ArticleDetail
import com.constitutionatlas.content.api.ArticleSummary
import com.constitutionatlas.content.api.ArticleWrite
import com.constitutionatlas.content.repo.ArticleRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class ArticleQueryService(private val articleRepository: ArticleRepository) {
    fun listByVersion(versionId: UUID, offset: Int = 0, limit: Int? = null): List<ArticleSummary> =
        articleRepository.listByVersion(versionId, offset, limit)

    fun countByVersion(versionId: UUID): Int = articleRepository.countByVersion(versionId)

    fun getById(id: UUID): ArticleDetail {
        val article = articleRepository.findById(id) ?: throw NotFoundException("Unknown article '$id'")
        return article.copy(children = articleRepository.listChildren(id))
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
}

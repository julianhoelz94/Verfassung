package com.constitutionatlas.content.service

import com.constitutionatlas.content.NotFoundException
import com.constitutionatlas.content.api.ArticleDetail
import com.constitutionatlas.content.api.ArticleSummary
import com.constitutionatlas.content.repo.ArticleRepository
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class ArticleQueryService(private val articleRepository: ArticleRepository) {
    fun listByVersion(versionId: UUID): List<ArticleSummary> = articleRepository.listByVersion(versionId)

    fun getById(id: UUID): ArticleDetail =
        articleRepository.findById(id) ?: throw NotFoundException("Unknown article '$id'")
}

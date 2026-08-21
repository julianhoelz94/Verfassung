package com.constitutionatlas.content.api

import com.constitutionatlas.content.service.ArticleQueryService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class ArticleController(private val articleQueryService: ArticleQueryService) {
    @GetMapping("/versions/{versionId}/articles")
    fun listArticles(@PathVariable versionId: UUID): List<ArticleSummary> =
        articleQueryService.listByVersion(versionId)

    @PutMapping("/versions/{versionId}/articles")
    fun replaceArticles(
        @PathVariable versionId: UUID,
        @RequestBody articles: List<ArticleWrite>,
    ): List<ArticleSummary> = articleQueryService.replaceForVersion(versionId, articles)

    @GetMapping("/articles/{articleId}")
    fun getArticle(@PathVariable articleId: UUID): ArticleDetail =
        articleQueryService.getById(articleId)
}

package com.constitutionatlas.content.api

import com.constitutionatlas.content.client.WriteAccess
import com.constitutionatlas.content.service.ArticleQueryService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class ArticleController(
    private val articleQueryService: ArticleQueryService,
    private val writeAccess: WriteAccess,
) {
    @GetMapping("/versions/{versionId}/articles")
    fun listArticles(
        @PathVariable versionId: UUID,
        @RequestParam(required = false) offset: Int?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false, defaultValue = "false") includeBody: Boolean,
    ): ResponseEntity<List<ArticleSummary>> {
        val off = (offset ?: 0).coerceAtLeast(0)
        val lim = (limit ?: 200).coerceIn(1, 200)
        val items = articleQueryService.listByVersion(versionId, off, lim, includeBody)
        val total = articleQueryService.countByVersion(versionId)
        return ResponseEntity.ok().header("X-Total-Count", total.toString()).body(items)
    }

    @PutMapping("/versions/{versionId}/articles")
    fun replaceArticles(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable versionId: UUID,
        @RequestBody articles: List<ArticleWrite>,
    ): List<ArticleSummary> {
        writeAccess.requireContentWriter(authorization)
        return articleQueryService.replaceForVersion(versionId, articles)
    }

    @GetMapping("/articles/{articleId}")
    fun getArticle(@PathVariable articleId: UUID): ArticleDetail =
        articleQueryService.getById(articleId)

    @PatchMapping("/articles/{articleId}")
    fun patchArticle(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable articleId: UUID,
        @RequestBody patch: ArticlePatch,
    ): ArticleDetail {
        writeAccess.requireContentWriter(authorization)
        return articleQueryService.updateText(articleId, patch.title, patch.body)
    }

    @PatchMapping("/nodes/{nodeId}")
    fun patchNode(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable nodeId: UUID,
        @RequestBody patch: NodePatch,
    ): ContentNodeDto {
        writeAccess.requireContentWriter(authorization)
        return articleQueryService.updateNodeTitle(nodeId, patch.title)
    }

    @PostMapping("/versions/{versionId}/restructure")
    fun restructure(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable versionId: UUID,
        @RequestBody request: RestructureRequest,
    ): Map<String, Int> {
        writeAccess.requireContentWriter(authorization)
        val absorbed = articleQueryService.restructure(versionId, request.keepKinds)
        return mapOf("absorbed" to absorbed)
    }
}

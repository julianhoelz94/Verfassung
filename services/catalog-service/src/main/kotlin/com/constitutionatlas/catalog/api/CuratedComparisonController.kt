package com.constitutionatlas.catalog.api

import com.constitutionatlas.catalog.client.WriteAccess
import com.constitutionatlas.catalog.service.CuratedComparisonService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class CuratedComparisonController(private val comparisons: CuratedComparisonService, private val access: WriteAccess) {
    @GetMapping("/curated-comparisons")
    fun list(@RequestHeader(value = "Authorization", required = false) authorization: String?) = comparisons.list(access.mayViewArchiveComparisons(authorization))

    @GetMapping("/curated-comparisons/{id}")
    fun get(@PathVariable id: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?) = comparisons.get(id, access.mayViewArchiveComparisons(authorization))

    @PostMapping("/curated-comparisons")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreateCuratedComparison, @RequestHeader(value = "Authorization", required = false) authorization: String?) = comparisons.create(request, access.requireCatalogWriter(authorization).id, authorization)

    @PostMapping("/curated-comparisons/{id}/review")
    fun review(@PathVariable id: UUID, @RequestBody request: ComparisonReviewRequest, @RequestHeader(value = "Authorization", required = false) authorization: String?) = comparisons.review(id, access.requireArchiveReviewer(authorization).id, request.reason)

    @PostMapping("/curated-comparisons/{id}/publish")
    fun publish(@PathVariable id: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?) = comparisons.publish(id, access.requireArchivePublisher(authorization).id)
}

package com.constitutionatlas.search.api

import com.constitutionatlas.search.service.SearchIndexService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
class SearchController(private val searchIndexService: SearchIndexService) {
    @GetMapping("/search")
    fun search(
        @RequestParam(required = false, defaultValue = "") q: String,
        @RequestParam(required = false, defaultValue = "20") limit: Int,
    ): List<SearchHit> = searchIndexService.search(q, limit)

    @PostMapping("/reindex")
    fun reindex(): ReindexResult = searchIndexService.reindex()
}

package com.constitutionatlas.search.api

import com.constitutionatlas.search.service.SearchIndexService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.util.UUID

@RestController
class SearchController(private val searchIndexService: SearchIndexService) {
    @GetMapping("/search")
    fun search(
        @RequestParam(required = false, defaultValue = "") q: String,
        @RequestParam(required = false) country: String?,
        @RequestParam(required = false) versionId: UUID?,
        @RequestParam(required = false) effectiveDate: LocalDate?,
        @RequestParam(required = false, defaultValue = "20") limit: Int,
    ): List<SearchHit> =
        searchIndexService.search(
            SearchQuery(
                text = q,
                countryCode = country?.trim()?.takeIf { it.isNotEmpty() },
                versionId = versionId,
                effectiveDate = effectiveDate,
                limit = limit,
            ),
        )

    @GetMapping("/search/facets")
    fun facets(): SearchFacets = searchIndexService.facets()

    @PostMapping("/reindex")
    fun reindex(): ReindexResult = searchIndexService.reindex()
}

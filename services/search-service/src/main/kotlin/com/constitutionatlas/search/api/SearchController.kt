package com.constitutionatlas.search.api

import com.constitutionatlas.search.auth.WriteAccess
import com.constitutionatlas.search.service.SearchIndexService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.util.UUID

@RestController
class SearchController(
    private val searchIndexService: SearchIndexService,
    private val writeAccess: WriteAccess,
) {
    @GetMapping("/search")
    fun search(
        @RequestParam(required = false, defaultValue = "") q: String,
        @RequestParam(required = false) country: String?,
        @RequestParam(required = false) versionId: UUID?,
        @RequestParam(required = false) effectiveDate: LocalDate?,
        @RequestParam(required = false, defaultValue = "20") limit: Int,
        @RequestParam(required = false, defaultValue = "0") offset: Int,
    ): SearchPage =
        searchIndexService.search(
            SearchQuery(
                text = q,
                countryCode = country?.trim()?.takeIf { it.isNotEmpty() },
                versionId = versionId,
                effectiveDate = effectiveDate,
                limit = limit,
                offset = offset,
            ),
        )

    @GetMapping("/search/facets")
    fun facets(): SearchFacets = searchIndexService.facets()

    @PostMapping("/reindex")
    fun reindex(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): ReindexResult {
        writeAccess.requireReindex(authorization)
        return searchIndexService.reindex()
    }
}

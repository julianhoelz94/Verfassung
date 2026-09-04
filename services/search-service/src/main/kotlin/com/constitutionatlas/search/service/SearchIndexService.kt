package com.constitutionatlas.search.service

import com.constitutionatlas.search.api.ReindexResult
import com.constitutionatlas.search.api.SearchFacets
import com.constitutionatlas.search.api.SearchHit
import com.constitutionatlas.search.api.SearchQuery
import com.constitutionatlas.search.client.IndexSource
import com.constitutionatlas.search.repo.SearchRepository
import org.springframework.stereotype.Service

@Service
class SearchIndexService(
    private val indexSource: IndexSource,
    private val searchRepository: SearchRepository,
) {
    fun reindex(): ReindexResult {
        val documents = indexSource.loadPublishedArticles()
        searchRepository.replaceAll(documents)
        return ReindexResult(documents.size, "ready")
    }

    fun search(query: SearchQuery): List<SearchHit> =
        searchRepository.search(query.copy(limit = query.limit.coerceIn(1, 50)))

    fun facets(): SearchFacets = searchRepository.facets()
}

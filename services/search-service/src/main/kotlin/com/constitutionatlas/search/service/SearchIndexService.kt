package com.constitutionatlas.search.service

import com.constitutionatlas.search.api.ReindexResult
import com.constitutionatlas.search.api.SearchFacets
import com.constitutionatlas.search.api.SearchPage
import com.constitutionatlas.search.api.SearchQuery
import com.constitutionatlas.search.client.IndexSource
import com.constitutionatlas.search.repo.SearchRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional

@Service
class SearchIndexService(
    private val indexSource: IndexSource,
    private val searchRepository: SearchRepository,
) {
    @Transactional
    fun reindex(): ReindexResult {
        searchRepository.lockForRebuild()
        val documents = indexSource.loadPublishedArticles()
        searchRepository.replaceAll(documents)
        return ReindexResult(documents.size, "ready")
    }

    fun search(query: SearchQuery): SearchPage =
        searchRepository.search(
            query.copy(
                limit = query.limit.coerceIn(1, 50),
                offset = query.offset.coerceAtLeast(0),
            ),
        )

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    fun facets(): SearchFacets = searchRepository.facets()
}

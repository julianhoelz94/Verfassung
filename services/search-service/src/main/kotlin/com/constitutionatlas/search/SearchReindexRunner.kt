package com.constitutionatlas.search

import com.constitutionatlas.search.service.SearchIndexService
import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["search.reindex-on-startup"], havingValue = "true")
class SearchReindexRunner(
    private val searchIndexService: SearchIndexService,
) : ApplicationRunner {
    private val log = LoggerFactory.getLogger(javaClass)

    override fun run(args: ApplicationArguments) {
        try {
            val result = searchIndexService.reindex()
            log.info("Search index rebuilt with {} documents", result.documentCount)
        } catch (ex: Exception) {
            log.warn("Search index rebuild on startup failed: {}", ex.message)
        }
    }
}

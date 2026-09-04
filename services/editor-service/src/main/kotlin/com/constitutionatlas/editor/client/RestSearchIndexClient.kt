package com.constitutionatlas.editor.client

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.client.RestClient

class RestSearchIndexClient(
    searchUrl: String,
) : SearchIndexClient {
    private val log = LoggerFactory.getLogger(javaClass)
    private val client: RestClient = RestClient.builder().baseUrl(searchUrl).build()

    override fun reindex() {
        try {
            client.post()
                .uri("/reindex")
                .retrieve()
                .toBodilessEntity()
        } catch (ex: Exception) {
            log.warn("search reindex failed: {}", ex.message)
        }
    }
}

@Configuration
class SearchIndexClientConfig {
    @Bean
    @ConditionalOnMissingBean(SearchIndexClient::class)
    fun searchIndexClient(@Value("\${search.api.url}") searchUrl: String): SearchIndexClient =
        RestSearchIndexClient(searchUrl)
}

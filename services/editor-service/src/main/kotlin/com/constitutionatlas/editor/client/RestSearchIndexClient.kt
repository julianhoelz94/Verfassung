package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.DownstreamException
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException

class RestSearchIndexClient(
    searchUrl: String,
    private val bearerToken: String? = null,
) : SearchIndexClient {
    private val client: RestClient = RestClient.builder().baseUrl(searchUrl).build()

    override fun reindex() {
        try {
            val request = client.post().uri("/reindex")
            if (!bearerToken.isNullOrBlank()) {
                request.header("Authorization", bearerHeader(bearerToken))
            }
            request
                .retrieve()
                .toBodilessEntity()
        } catch (ex: RestClientException) {
            throw DownstreamException("search reindex failed", ex)
        }
    }
}

@Configuration
class SearchIndexClientConfig {
    @Bean
    @ConditionalOnMissingBean(SearchIndexClient::class)
    fun searchIndexClient(
        @Value("\${search.api.url}") searchUrl: String,
        @Value("\${editor.downstream.bearer:}") bearer: String,
    ): SearchIndexClient = RestSearchIndexClient(searchUrl, bearer.trim().ifBlank { null })
}

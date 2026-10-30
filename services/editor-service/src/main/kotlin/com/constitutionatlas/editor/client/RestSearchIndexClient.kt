package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.platform.timedRestClientBuilder
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import java.time.Duration

class RestSearchIndexClient(
    searchUrl: String,
    private val bearerToken: String? = null,
) : SearchIndexClient {
    // Rebuilds traverse the published corpus; timing out early leaves the rebuild
    // running while the outbox submits another copy on its next attempt.
    private val client: RestClient = timedRestClientBuilder(searchUrl, Duration.ofSeconds(60)).build()

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

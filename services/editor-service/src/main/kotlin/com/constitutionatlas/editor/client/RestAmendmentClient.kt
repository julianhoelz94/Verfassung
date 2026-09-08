package com.constitutionatlas.editor.client

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import java.util.UUID

interface AmendmentClient {
    fun recordTransition(sourceVersionId: UUID, targetVersionId: UUID)
}

class RestAmendmentClient(
    amendmentUrl: String,
    private val bearerToken: String? = null,
) : AmendmentClient {
    private val log = LoggerFactory.getLogger(javaClass)
    private val client: RestClient = timedRestClient(amendmentUrl)

    override fun recordTransition(sourceVersionId: UUID, targetVersionId: UUID) {
        try {
            val request = client.post()
                .uri("/transitions")
                .contentType(MediaType.APPLICATION_JSON)
            if (!bearerToken.isNullOrBlank()) {
                request.header("Authorization", bearerHeader(bearerToken))
            }
            request
                .body(
                    mapOf(
                        "sourceVersionId" to sourceVersionId,
                        "targetVersionId" to targetVersionId,
                    ),
                )
                .retrieve()
                .toBodilessEntity()
        } catch (ex: RestClientException) {
            log.warn("amendment transition not recorded: {}", ex.message)
        }
    }
}

@Configuration
class AmendmentClientConfig {
    @Bean
    @ConditionalOnMissingBean(AmendmentClient::class)
    fun amendmentClient(
        @Value("\${amendment.api.url}") amendmentUrl: String,
        @Value("\${editor.downstream.bearer:}") bearer: String,
    ): AmendmentClient = RestAmendmentClient(amendmentUrl, bearer.trim().ifBlank { null })
}

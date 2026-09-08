package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.api.Actor
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import java.util.UUID

class RestAuditClient(
    auditUrl: String,
    private val bearerToken: String? = null,
) : AuditClient {
    private val client: RestClient = timedRestClient(auditUrl)

    override fun record(
        actor: Actor,
        action: String,
        entityType: String,
        entityId: UUID,
        payload: Map<String, Any?>,
    ) {
        try {
            val request = client.post()
                .uri("/events")
                .contentType(MediaType.APPLICATION_JSON)
            if (!bearerToken.isNullOrBlank()) {
                request.header("Authorization", bearerHeader(bearerToken))
            }
            request
                .body(
                    mapOf(
                        "actorId" to actor.id,
                        "actorEmail" to actor.email,
                        "action" to action,
                        "entityType" to entityType,
                        "entityId" to entityId,
                        "payload" to payload,
                    ),
                )
                .retrieve()
                .toBodilessEntity()
        } catch (ex: RestClientException) {
            throw DownstreamException("audit append failed", ex)
        }
    }
}

@Configuration
class AuditClientConfig {
    @Bean
    @ConditionalOnMissingBean(AuditClient::class)
    fun auditClient(
        @Value("\${audit.api.url}") auditUrl: String,
        @Value("\${editor.downstream.bearer:}") bearer: String,
    ): AuditClient = RestAuditClient(auditUrl, bearer.trim().ifBlank { null })
}

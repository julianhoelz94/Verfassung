package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.api.Actor
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import java.util.UUID

class RestAuditClient(
    auditUrl: String,
) : AuditClient {
    private val log = LoggerFactory.getLogger(javaClass)
    private val client: RestClient = RestClient.builder().baseUrl(auditUrl).build()

    override fun record(
        actor: Actor,
        action: String,
        entityType: String,
        entityId: UUID,
        payload: Map<String, Any?>,
    ) {
        try {
            client.post()
                .uri("/events")
                .contentType(MediaType.APPLICATION_JSON)
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
        } catch (ex: Exception) {
            log.warn("audit append failed: {}", ex.message)
        }
    }
}

@Configuration
class AuditClientConfig {
    @Bean
    @ConditionalOnMissingBean(AuditClient::class)
    fun auditClient(@Value("\${audit.api.url}") auditUrl: String): AuditClient =
        RestAuditClient(auditUrl)
}

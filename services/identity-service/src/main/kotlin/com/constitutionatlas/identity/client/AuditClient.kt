package com.constitutionatlas.identity.client

import com.constitutionatlas.identity.CorrelationIdFilter
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import java.util.UUID

interface AuditClient {
    fun record(
        action: String,
        entityType: String,
        entityId: UUID,
        actorId: UUID?,
        actorEmail: String?,
        payload: Map<String, Any?>,
    )
}

class RestAuditClient(
    auditUrl: String,
) : AuditClient {
    private val log = LoggerFactory.getLogger(javaClass)
    private val client: RestClient = RestClient.builder().baseUrl(auditUrl).build()

    override fun record(
        action: String,
        entityType: String,
        entityId: UUID,
        actorId: UUID?,
        actorEmail: String?,
        payload: Map<String, Any?>,
    ) {
        try {
            val body = mutableMapOf<String, Any?>(
                "action" to action,
                "entityType" to entityType,
                "entityId" to entityId,
                "payload" to payload,
            )
            if (actorId != null) {
                body["actorId"] = actorId
            }
            if (actorEmail != null) {
                body["actorEmail"] = actorEmail
            }
            client.post()
                .uri("/events")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .toBodilessEntity()
        } catch (ex: Exception) {
            log.warn("audit append failed: {}", ex.message)
        }
    }
}

@Component
class AuthAudit(
    private val auditClient: AuditClient,
) {
    fun record(
        action: String,
        entityId: UUID,
        actorId: UUID?,
        actorEmail: String?,
        clientIp: String,
        userAgent: String?,
        extra: Map<String, Any?> = emptyMap(),
    ) {
        val payload = linkedMapOf<String, Any?>(
            "correlationId" to MDC.get(CorrelationIdFilter.MDC_KEY),
            "clientIp" to clientIp.ifBlank { "unknown" },
        )
        if (!userAgent.isNullOrBlank()) {
            payload["userAgent"] = userAgent.take(200)
        }
        extra.forEach { (key, value) -> payload[key] = value }
        auditClient.record(action, "user", entityId, actorId, actorEmail, payload)
    }

    fun recordMfaChange(
        actorId: UUID,
        actorEmail: String,
        clientIp: String,
        userAgent: String?,
        extra: Map<String, Any?> = emptyMap(),
    ) {
        record("mfa_changed", actorId, actorId, actorEmail, clientIp, userAgent, extra)
    }
}

@Configuration
class AuditClientConfig {
    @Bean
    @ConditionalOnMissingBean(AuditClient::class)
    fun auditClient(@Value("\${audit.api.url}") auditUrl: String): AuditClient =
        RestAuditClient(auditUrl)
}

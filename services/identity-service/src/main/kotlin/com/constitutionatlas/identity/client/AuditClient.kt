package com.constitutionatlas.identity.client

import com.constitutionatlas.platform.CorrelationIdFilter
import org.slf4j.MDC
import org.springframework.stereotype.Component
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

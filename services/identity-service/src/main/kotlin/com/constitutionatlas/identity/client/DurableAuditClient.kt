package com.constitutionatlas.identity.client

import com.constitutionatlas.identity.repo.AuditOutboxRepository
import com.constitutionatlas.identity.repo.PendingAudit
import com.constitutionatlas.platform.timedRestClient
import tools.jackson.databind.node.ObjectNode
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

open class DurableAuditClient(private val outbox: AuditOutboxRepository) : AuditClient {
    @Transactional
    override fun record(action: String, entityType: String, entityId: UUID, actorId: UUID?, actorEmail: String?, payload: Map<String, Any?>) {
        outbox.enqueue(mapOf("action" to action, "entityType" to entityType, "entityId" to entityId, "actorId" to actorId, "actorEmail" to actorEmail, "payload" to payload))
    }
}

fun interface AuditDeliveryClient {
    fun deliver(event: PendingAudit)
}

class RestAuditDeliveryClient(auditUrl: String, private val bearerToken: String?) : AuditDeliveryClient {
    private val client = timedRestClient(auditUrl)
    override fun deliver(event: PendingAudit) {
        val body = event.body.deepCopy<ObjectNode>().put("eventId", event.eventId.toString()).put("occurredAt", event.occurredAt.toString())
        val request = client.post().uri("/events").contentType(MediaType.APPLICATION_JSON)
        if (!bearerToken.isNullOrBlank()) request.header("Authorization", if (bearerToken.startsWith("Bearer ")) bearerToken else "Bearer $bearerToken")
        request.body(body).retrieve().toBodilessEntity()
    }
}

@Configuration
class AuditClientConfig {
    @Bean
    fun auditClient(outbox: AuditOutboxRepository): AuditClient = DurableAuditClient(outbox)

    @Bean
    fun auditDeliveryClient(@Value("\${audit.api.url}") url: String, @Value("\${audit.api.bearer:}") bearer: String): AuditDeliveryClient =
        RestAuditDeliveryClient(url, bearer.trim().ifBlank { null })
}

@Component
class AuditOutboxPublisher(
    private val outbox: AuditOutboxRepository,
    private val delivery: AuditDeliveryClient,
    transactions: PlatformTransactionManager,
) {
    private val transaction = TransactionTemplate(transactions)
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${identity.audit.poll-ms:5000}", initialDelayString = "\${identity.audit.poll-ms:5000}")
    fun processDue() {
        repeat(10) {
            val found = transaction.execute {
                val event = outbox.claimNext() ?: return@execute false
                try {
                    delivery.deliver(event)
                    outbox.delivered(event.eventId)
                } catch (ex: RuntimeException) {
                    // Keep payloads and credentials out of delivery diagnostics.
                    log.warn("security audit delivery {} failed: {}", event.eventId, ex.javaClass.simpleName)
                    outbox.failed(event.eventId, ex.javaClass.simpleName)
                }
                true
            }
            if (found != true) return
        }
    }
}

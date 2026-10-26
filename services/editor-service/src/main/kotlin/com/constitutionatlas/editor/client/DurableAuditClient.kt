package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.PendingAudit
import com.constitutionatlas.editor.service.DomainEvents
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.timedRestClient
import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

open class DurableAuditClient(private val repository: EditorRepository) : AuditClient {
    @Transactional
    override fun record(actor: Actor, action: String, entityType: String, entityId: UUID, payload: Map<String, Any?>) {
        require(entityType == "edit_session") { "Editor audit events must belong to an edit session" }
        repository.insertOutboxEvent(
            entityId,
            DomainEvents.AUDIT_APPEND_REQUESTED,
            mapOf(
                "actorId" to actor.id,
                "actorEmail" to actor.email,
                "action" to action,
                "entityType" to entityType,
                "entityId" to entityId,
                "payload" to payload,
            ),
        )
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
        if (!bearerToken.isNullOrBlank()) request.header("Authorization", bearerHeader(bearerToken))
        request.body(body).retrieve().toBodilessEntity()
    }
}

@Configuration
class AuditClientConfig {
    @Bean
    fun auditClient(repository: EditorRepository): AuditClient = DurableAuditClient(repository)

    @Bean
    fun auditDeliveryClient(@Value("\${audit.api.url}") url: String, @Value("\${editor.downstream.bearer:}") bearer: String): AuditDeliveryClient =
        RestAuditDeliveryClient(url, bearer.trim().ifBlank { null })
}

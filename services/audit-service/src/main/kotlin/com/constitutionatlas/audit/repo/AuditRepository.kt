package com.constitutionatlas.audit.repo

import com.constitutionatlas.audit.api.AppendEventRequest
import com.constitutionatlas.audit.api.AuditEventDto
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.ZoneOffset
import java.util.UUID

@Repository
class AuditRepository(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun insert(request: AppendEventRequest): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO audit_events (id, actor_id, actor_email, action, entity_type, entity_id, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)
            """.trimIndent(),
            id,
            request.actorId,
            request.actorEmail,
            request.action,
            request.entityType,
            request.entityId,
            request.payload?.let { objectMapper.writeValueAsString(it) },
        )
        return id
    }

    fun listByEntity(entityType: String, entityId: UUID): List<AuditEventDto> =
        jdbc.query(
            """
            SELECT id, occurred_at, actor_id, actor_email, action, entity_type, entity_id, payload::text
            FROM audit_events
            WHERE entity_type = ? AND entity_id = ?
            ORDER BY occurred_at DESC
            """.trimIndent(),
            { rs, _ ->
                AuditEventDto(
                    id = rs.getObject("id", UUID::class.java),
                    occurredAt = rs.getTimestamp("occurred_at").toInstant().atOffset(ZoneOffset.UTC),
                    actorId = rs.getObject("actor_id", UUID::class.java),
                    actorEmail = rs.getString("actor_email"),
                    action = rs.getString("action"),
                    entityType = rs.getString("entity_type"),
                    entityId = rs.getObject("entity_id", UUID::class.java),
                    payload = rs.getString("payload"),
                )
            },
            entityType,
            entityId,
        )
}

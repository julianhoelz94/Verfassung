package com.constitutionatlas.audit.repo

import com.constitutionatlas.audit.api.AppendEventRequest
import com.constitutionatlas.audit.api.AuditEventDto
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.sql.Timestamp
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

@Repository
class AuditRepository(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    @Transactional
    fun insert(request: AppendEventRequest): UUID {
        val id = request.eventId ?: UUID.randomUUID()
        val payload = request.payload?.let { objectMapper.writeValueAsString(it) }
        if (request.eventId != null) {
            // Serialize a delivery's retries without UPDATE/ON CONFLICT against the
            // append-only table. A new statement sees the preceding writer's commit.
            jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))", org.springframework.jdbc.core.RowCallbackHandler { }, id.toString())
            val existing = findById(id)
            if (existing != null) {
                // Compare using the same JSONB semantics as storage, including
                // normalized numbers and SQL NULL for an omitted payload.
                val samePayload = jdbc.queryForObject(
                    "SELECT payload IS NOT DISTINCT FROM ?::jsonb FROM audit_events WHERE id = ?",
                    Boolean::class.java,
                    payload,
                    id,
                ) == true
                val sameTime = request.occurredAt == null || existing.occurredAt.toInstant() == request.occurredAt.toInstant().truncatedTo(ChronoUnit.MICROS)
                if (existing.actorId != request.actorId ||
                    existing.actorEmail != request.actorEmail ||
                    existing.action != request.action ||
                    existing.entityType != request.entityType ||
                    existing.entityId != request.entityId ||
                    !samePayload ||
                    !sameTime
                ) {
                    throw ResponseStatusException(HttpStatus.CONFLICT, "Audit event ID already belongs to a different event")
                }
                return id
            }
        }
        jdbc.update(
            """
            INSERT INTO audit_events (id, occurred_at, actor_id, actor_email, action, entity_type, entity_id, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
            """.trimIndent(),
            id,
            Timestamp.from((request.occurredAt?.toInstant() ?: Instant.now()).truncatedTo(ChronoUnit.MICROS)),
            request.actorId,
            request.actorEmail,
            request.action,
            request.entityType,
            request.entityId,
            payload,
        )
        return id
    }

    fun findById(id: UUID): AuditEventDto? = jdbc.query(
        "SELECT id, occurred_at, actor_id, actor_email, action, entity_type, entity_id, payload::text FROM audit_events WHERE id = ?",
        { rs, _ -> event(rs) },
        id,
    ).firstOrNull()

    fun listByEntity(entityType: String, entityId: UUID): List<AuditEventDto> =
        jdbc.query(
            """
            SELECT id, occurred_at, actor_id, actor_email, action, entity_type, entity_id, payload::text
            FROM audit_events
            WHERE entity_type = ? AND entity_id = ?
            ORDER BY occurred_at DESC
            """.trimIndent(),
            { rs, _ ->
                event(rs)
            },
            entityType,
            entityId,
        )
    private fun event(rs: java.sql.ResultSet): AuditEventDto = AuditEventDto(
        id = rs.getObject("id", UUID::class.java),
        occurredAt = rs.getTimestamp("occurred_at").toInstant().atOffset(ZoneOffset.UTC),
        actorId = rs.getObject("actor_id", UUID::class.java),
        actorEmail = rs.getString("actor_email"),
        action = rs.getString("action"),
        entityType = rs.getString("entity_type"),
        entityId = rs.getObject("entity_id", UUID::class.java),
        payload = rs.getString("payload"),
    )
}

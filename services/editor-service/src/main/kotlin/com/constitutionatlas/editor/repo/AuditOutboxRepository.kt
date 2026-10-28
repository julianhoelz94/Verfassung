package com.constitutionatlas.editor.repo

import com.constitutionatlas.editor.service.DomainEvents
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class AuditOutboxRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun claimNext(): PendingAudit? = jdbc.query(
        """
        SELECT id, created_at, payload FROM outbox_events
        WHERE event_name = ? AND published_at IS NULL AND next_attempt_at <= clock_timestamp()
        ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
        """.trimIndent(),
        { rs, _ -> PendingAudit(rs.getObject("id", UUID::class.java), rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC), mapper.readTree(rs.getString("payload"))) },
        DomainEvents.AUDIT_APPEND_REQUESTED,
    ).firstOrNull()

    fun delivered(id: UUID) {
        jdbc.update("UPDATE outbox_events SET published_at = clock_timestamp(), last_error = NULL WHERE id = ?", id)
    }

    fun failed(id: UUID, error: String) {
        jdbc.update(
            """
            UPDATE outbox_events SET attempt_count = attempt_count + 1, last_error = ?,
              next_attempt_at = clock_timestamp() + make_interval(secs => LEAST(3600, 5 * power(2, LEAST(attempt_count, 10)))::int)
            WHERE id = ?
            """.trimIndent(),
            error.take(200),
            id,
        )
    }

    fun statuses(): List<Map<String, Any>> = listOf(
        "audit" to listOf(DomainEvents.AUDIT_APPEND_REQUESTED),
        "search" to listOf(DomainEvents.SEARCH_REINDEX_REQUESTED),
        "amendment" to listOf(DomainEvents.AMENDMENT_LINK_REQUESTED, DomainEvents.REVIEW_STATUS_REFRESH_REQUESTED),
    ).map { (name, events) ->
        jdbc.queryForObject(
            """
            SELECT COUNT(*) AS pending, COUNT(*) FILTER (WHERE last_error IS NOT NULL) AS failed,
              COALESCE(GREATEST(0, EXTRACT(EPOCH FROM clock_timestamp() - MIN(created_at))), 0)::bigint AS oldest
            FROM outbox_events WHERE published_at IS NULL AND event_name IN (${events.joinToString { "?" }})
            """.trimIndent(),
            { rs, _ -> mapOf("name" to name, "pendingCount" to rs.getLong("pending"), "failedCount" to rs.getLong("failed"), "oldestAgeSeconds" to rs.getLong("oldest")) },
            *events.toTypedArray(),
        )!!
    }
}

data class PendingAudit(val eventId: UUID, val occurredAt: OffsetDateTime, val body: JsonNode)

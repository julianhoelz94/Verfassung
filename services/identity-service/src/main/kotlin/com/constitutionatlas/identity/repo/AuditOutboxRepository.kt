package com.constitutionatlas.identity.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class AuditOutboxRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun enqueue(body: Map<String, Any?>): UUID {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO security_audit_outbox (id, body) VALUES (?, ?::jsonb)", id, mapper.writeValueAsString(body))
        return id
    }

    fun claimNext(): PendingAudit? = jdbc.query(
        """
        SELECT id, occurred_at, body FROM security_audit_outbox
        WHERE delivered_at IS NULL AND next_attempt_at <= clock_timestamp()
        ORDER BY occurred_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
        """.trimIndent(),
        { rs, _ -> PendingAudit(rs.getObject("id", UUID::class.java), rs.getTimestamp("occurred_at").toInstant().atOffset(ZoneOffset.UTC), mapper.readTree(rs.getString("body"))) },
    ).firstOrNull()

    fun delivered(id: UUID) {
        jdbc.update("UPDATE security_audit_outbox SET delivered_at = clock_timestamp(), last_error = NULL WHERE id = ?", id)
    }

    fun failed(id: UUID, error: String) {
        jdbc.update(
            """
            UPDATE security_audit_outbox SET attempt_count = attempt_count + 1, last_error = ?,
              next_attempt_at = clock_timestamp() + make_interval(secs => LEAST(3600, 5 * power(2, LEAST(attempt_count, 10)))::int)
            WHERE id = ?
            """.trimIndent(),
            error.take(200),
            id,
        )
    }

    fun status(): Map<String, Any> = jdbc.queryForObject(
        """
        SELECT COUNT(*) AS pending, COUNT(*) FILTER (WHERE last_error IS NOT NULL) AS failed,
          COALESCE(GREATEST(0, EXTRACT(EPOCH FROM clock_timestamp() - MIN(occurred_at))), 0)::bigint AS oldest
        FROM security_audit_outbox WHERE delivered_at IS NULL
        """.trimIndent(),
        { rs, _ -> mapOf("name" to "audit", "pendingCount" to rs.getLong("pending"), "failedCount" to rs.getLong("failed"), "oldestAgeSeconds" to rs.getLong("oldest")) },
    )!!
}

data class PendingAudit(val eventId: UUID, val occurredAt: OffsetDateTime, val body: JsonNode)

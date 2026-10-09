package com.constitutionatlas.ingestion.repo

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

data class PublicationEvent(val id: UUID, val type: String, val payload: String, val attempts: Int)

@Repository
class ImportPublicationOutbox(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun enqueue(jobId: UUID, type: String, payload: Any) {
        jdbc.update(
            "INSERT INTO import_publication_outbox (id, import_job_id, event_type, payload) VALUES (?, ?, ?, ?::jsonb) ON CONFLICT (import_job_id, event_type) DO NOTHING",
            UUID.randomUUID(), jobId, type, mapper.writeValueAsString(payload),
        )
    }

    fun pending(limit: Int = 10): List<PublicationEvent> = jdbc.query(
        "SELECT id, event_type, payload::text, attempts FROM import_publication_outbox WHERE delivered_at IS NULL AND available_at <= now() ORDER BY created_at LIMIT ? FOR UPDATE SKIP LOCKED",
        { rs, _ -> PublicationEvent(rs.getObject("id", UUID::class.java), rs.getString("event_type"), rs.getString(3), rs.getInt("attempts")) }, limit,
    )

    fun delivered(id: UUID) {
        jdbc.update("UPDATE import_publication_outbox SET delivered_at = now() WHERE id = ? AND delivered_at IS NULL", id)
    }

    fun retry(id: UUID, attempts: Int) {
        val delaySeconds = (5L shl attempts.coerceAtMost(9)).coerceAtMost(3600L)
        jdbc.update(
            "UPDATE import_publication_outbox SET attempts = attempts + 1, available_at = ? WHERE id = ? AND delivered_at IS NULL",
            OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(delaySeconds), id,
        )
    }
}

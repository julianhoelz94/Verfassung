package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.LifecycleEvent
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Date
import java.time.LocalDate
import java.util.UUID

@Repository
class LifecycleRepository(private val jdbc: JdbcTemplate) {
    fun events(constitutionId: UUID): List<LifecycleEvent> =
        jdbc.query(
            """
            SELECT e.id, e.constitution_id, e.event_type, e.event_date,
              CASE WHEN r.id IS NULL THEN e.source_url ELSE r.source_url END AS source_url,
              CASE WHEN r.id IS NULL THEN e.note ELSE r.note END AS note, e.date_certainty, r.id AS evidence_revision_id
            FROM constitution_lifecycle_events e
            LEFT JOIN LATERAL (SELECT * FROM lifecycle_evidence_revisions WHERE event_id = e.id ORDER BY created_at DESC, id DESC LIMIT 1) r ON TRUE
            WHERE e.constitution_id = ?
            ORDER BY e.event_date, e.created_at, e.id
            """.trimIndent(),
            { rs, _ ->
                LifecycleEvent(
                    rs.getObject("id", UUID::class.java),
                    rs.getObject("constitution_id", UUID::class.java),
                    rs.getString("event_type"),
                    rs.getDate("event_date").toLocalDate(),
                    rs.getString("source_url"),
                    rs.getString("note"),
                    rs.getString("date_certainty"),
                    rs.getObject("evidence_revision_id", UUID::class.java),
                )
            },
            constitutionId,
        )

    fun countryEvents(isoCode: String): List<LifecycleEvent> =
        jdbc.query(
            """
            SELECT e.id, e.constitution_id, e.event_type, e.event_date,
              CASE WHEN r.id IS NULL THEN e.source_url ELSE r.source_url END AS source_url,
              CASE WHEN r.id IS NULL THEN e.note ELSE r.note END AS note, e.date_certainty, r.id AS evidence_revision_id
            FROM constitution_lifecycle_events e
            LEFT JOIN LATERAL (SELECT * FROM lifecycle_evidence_revisions WHERE event_id = e.id ORDER BY created_at DESC, id DESC LIMIT 1) r ON TRUE
            JOIN constitutions c ON c.id = e.constitution_id
            JOIN countries country ON country.id = c.country_id
            WHERE country.iso_code = ?
            ORDER BY e.event_date, e.created_at, e.id
            """.trimIndent(),
            { rs, _ ->
                LifecycleEvent(
                    rs.getObject("id", UUID::class.java),
                    rs.getObject("constitution_id", UUID::class.java),
                    rs.getString("event_type"),
                    rs.getDate("event_date").toLocalDate(),
                    rs.getString("source_url"),
                    rs.getString("note"),
                    rs.getString("date_certainty"),
                    rs.getObject("evidence_revision_id", UUID::class.java),
                )
            },
            isoCode.uppercase(),
        )

    fun insert(constitutionId: UUID, eventType: String, eventDate: LocalDate, sourceUrl: String?, note: String?, dateCertainty: String, actorId: UUID): LifecycleEvent {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO constitution_lifecycle_events
              (id, constitution_id, event_type, event_date, source_url, note, date_certainty, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            constitutionId,
            eventType,
            Date.valueOf(eventDate),
            sourceUrl,
            note,
            dateCertainty,
            actorId,
        )
        return LifecycleEvent(id, constitutionId, eventType, eventDate, sourceUrl, note, dateCertainty)
    }

    fun reviseEvidence(constitutionId: UUID, eventId: UUID, note: String?, sourceUrl: String?, expectedRevisionId: UUID?, actorId: UUID): LifecycleEvent {
        jdbc.query("SELECT id FROM constitution_lifecycle_events WHERE id = ? AND constitution_id = ? FOR UPDATE", { rs, _ -> rs.getObject("id", UUID::class.java) }, eventId, constitutionId)
        val event = events(constitutionId).find { it.id == eventId } ?: throw com.constitutionatlas.platform.NotFoundException("Lifecycle event not found")
        if (event.evidenceRevisionId != expectedRevisionId) throw com.constitutionatlas.catalog.ConflictException("Lifecycle evidence changed; reload before saving", "lifecycle_evidence_conflict")
        jdbc.update("INSERT INTO lifecycle_evidence_revisions (id, event_id, predecessor_id, note, source_url, created_by) VALUES (?, ?, ?, ?, ?, ?)", UUID.randomUUID(), eventId, expectedRevisionId, note, sourceUrl, actorId)
        return events(constitutionId).first { it.id == eventId }
    }
}

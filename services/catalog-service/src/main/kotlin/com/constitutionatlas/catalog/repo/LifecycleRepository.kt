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
            SELECT id, constitution_id, event_type, event_date, source_url, note
            FROM constitution_lifecycle_events
            WHERE constitution_id = ?
            ORDER BY event_date, created_at, id
            """.trimIndent(),
            { rs, _ ->
                LifecycleEvent(
                    rs.getObject("id", UUID::class.java),
                    rs.getObject("constitution_id", UUID::class.java),
                    rs.getString("event_type"),
                    rs.getDate("event_date").toLocalDate(),
                    rs.getString("source_url"),
                    rs.getString("note"),
                )
            },
            constitutionId,
        )

    fun countryEvents(isoCode: String): List<LifecycleEvent> =
        jdbc.query(
            """
            SELECT e.id, e.constitution_id, e.event_type, e.event_date, e.source_url, e.note
            FROM constitution_lifecycle_events e
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
                )
            },
            isoCode.uppercase(),
        )

    fun insert(constitutionId: UUID, eventType: String, eventDate: LocalDate, sourceUrl: String?, note: String?, actorId: UUID): LifecycleEvent {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO constitution_lifecycle_events
              (id, constitution_id, event_type, event_date, source_url, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            constitutionId,
            eventType,
            Date.valueOf(eventDate),
            sourceUrl,
            note,
            actorId,
        )
        return LifecycleEvent(id, constitutionId, eventType, eventDate, sourceUrl, note)
    }
}

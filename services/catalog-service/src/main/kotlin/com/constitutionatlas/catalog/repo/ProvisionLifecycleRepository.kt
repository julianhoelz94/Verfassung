package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.ProvisionLifecycleEvent
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Date
import java.sql.ResultSet
import java.util.UUID

@Repository
class ProvisionLifecycleRepository(private val jdbc: JdbcTemplate) {
    fun events(constitutionId: UUID): List<ProvisionLifecycleEvent> =
        jdbc.query(
            """
            SELECT id, constitution_id, source_version_id, event_type, event_date, logical_unit_ids, source_url, note
            FROM constitution_provision_events
            WHERE constitution_id = ?
            ORDER BY event_date, created_at, id
            """.trimIndent(),
            { rs, _ -> map(rs) },
            constitutionId,
        )

    fun countryEvents(isoCode: String): List<ProvisionLifecycleEvent> =
        jdbc.query(
            """
            SELECT e.id, e.constitution_id, e.source_version_id, e.event_type, e.event_date, e.logical_unit_ids, e.source_url, e.note
            FROM constitution_provision_events e
            JOIN constitutions c ON c.id = e.constitution_id
            JOIN countries country ON country.id = c.country_id
            WHERE country.iso_code = ?
            ORDER BY e.event_date, e.created_at, e.id
            """.trimIndent(),
            { rs, _ -> map(rs) },
            isoCode.uppercase(),
        )

    fun insert(constitutionId: UUID, request: com.constitutionatlas.catalog.api.CreateProvisionLifecycleEvent, actorId: UUID): ProvisionLifecycleEvent {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO constitution_provision_events
              (id, constitution_id, source_version_id, event_type, event_date, logical_unit_ids, source_url, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?::uuid[], ?, ?, ?)
            """.trimIndent(),
            id,
            constitutionId,
            request.sourceVersionId,
            request.eventType,
            Date.valueOf(request.eventDate),
            request.logicalUnitIds.joinToString(prefix = "{", postfix = "}"),
            request.sourceUrl,
            request.note,
            actorId,
        )
        return ProvisionLifecycleEvent(
            id,
            constitutionId,
            request.sourceVersionId,
            request.eventType,
            request.eventDate,
            request.logicalUnitIds,
            request.sourceUrl,
            request.note,
        )
    }

    private fun map(rs: ResultSet): ProvisionLifecycleEvent =
        ProvisionLifecycleEvent(
            rs.getObject("id", UUID::class.java),
            rs.getObject("constitution_id", UUID::class.java),
            rs.getObject("source_version_id", UUID::class.java),
            rs.getString("event_type"),
            rs.getDate("event_date").toLocalDate(),
            (rs.getArray("logical_unit_ids").array as Array<*>).map { it as UUID },
            rs.getString("source_url"),
            rs.getString("note"),
        )
}

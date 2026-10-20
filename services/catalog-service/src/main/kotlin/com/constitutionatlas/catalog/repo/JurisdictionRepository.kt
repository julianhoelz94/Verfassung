package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.JurisdictionSummary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.time.LocalDate
import java.util.UUID

@Repository
class JurisdictionRepository(private val jdbc: JdbcTemplate) {
    fun find(id: UUID): JurisdictionSummary? = jdbc.query(
        "SELECT * FROM jurisdictions WHERE id = ?",
        mapper,
        id,
    ).firstOrNull()

    fun children(parentId: UUID?): List<JurisdictionSummary> = jdbc.query(
        "SELECT * FROM jurisdictions WHERE parent_id IS NOT DISTINCT FROM ?::uuid ORDER BY name, id",
        mapper,
        parentId,
    )

    fun ancestors(id: UUID): List<JurisdictionSummary> = jdbc.query(
        """
        WITH RECURSIVE ancestors AS (
          SELECT parent.*, 1 AS depth FROM jurisdictions child
          JOIN jurisdictions parent ON parent.id = child.parent_id WHERE child.id = ?
          UNION ALL
          SELECT parent.*, ancestors.depth + 1 FROM ancestors
          JOIN jurisdictions parent ON parent.id = ancestors.parent_id
        )
        SELECT * FROM ancestors ORDER BY depth DESC
        """.trimIndent(),
        mapper,
        id,
    )

    fun insert(
        parentId: UUID?,
        slug: String,
        name: String,
        kind: String,
        code: String?,
        historical: Boolean,
        existedFrom: LocalDate?,
        existedUntil: LocalDate?,
    ): JurisdictionSummary {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO jurisdictions(id, parent_id, slug, name, kind, code, historical, existed_from, existed_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            id,
            parentId,
            slug,
            name,
            kind,
            code,
            historical,
            existedFrom?.let(java.sql.Date::valueOf),
            existedUntil?.let(java.sql.Date::valueOf),
        )
        return JurisdictionSummary(id, parentId, slug, name, kind, code, historical, existedFrom, existedUntil)
    }

    fun setExistenceDates(id: UUID, existedFrom: LocalDate?) {
        jdbc.update("UPDATE jurisdictions SET existed_from = ? WHERE id = ?", existedFrom?.let(java.sql.Date::valueOf), id)
    }

    private val mapper = RowMapper { result, _ ->
        JurisdictionSummary(
            result.getObject("id", UUID::class.java),
            result.getObject("parent_id", UUID::class.java),
            result.getString("slug"),
            result.getString("name"),
            result.getString("kind"),
            result.getString("code"),
            result.getBoolean("historical"),
            result.getDate("existed_from")?.toLocalDate(),
            result.getDate("existed_until")?.toLocalDate(),
        )
    }
}

package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.ContentOutlineDto
import com.constitutionatlas.catalog.api.SettingsRevision
import com.constitutionatlas.platform.NotFoundException
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class SettingsRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun currentId(constitutionId: UUID, lock: Boolean = false): UUID? =
        jdbc.query(
            "SELECT settings_revision_id FROM constitutions WHERE id = ?" + if (lock) " FOR UPDATE" else "",
            { rs, _ -> rs.getObject("settings_revision_id", UUID::class.java) },
            constitutionId,
        ).firstOrNull()

    fun find(constitutionId: UUID, revisionId: UUID): SettingsRevision =
        jdbc.query(
            "SELECT id, predecessor_id, outline::text FROM constitution_settings_revisions WHERE constitution_id = ? AND id = ?",
            { rs, _ ->
                SettingsRevision(
                    rs.getObject("id", UUID::class.java),
                    rs.getObject("predecessor_id", UUID::class.java),
                    mapper.readValue(rs.getString("outline"), ContentOutlineDto::class.java),
                )
            },
            constitutionId,
            revisionId,
        ).firstOrNull() ?: throw NotFoundException("Unknown settings revision '$revisionId'")

    fun append(constitutionId: UUID, outline: ContentOutlineDto): UUID {
        val predecessor = currentId(constitutionId, lock = true)
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO constitution_settings_revisions(id, constitution_id, predecessor_id, outline) VALUES (?, ?, ?, ?::jsonb)",
            id,
            constitutionId,
            predecessor,
            mapper.writeValueAsString(outline),
        )
        jdbc.update("UPDATE constitutions SET settings_revision_id = ? WHERE id = ?", id, constitutionId)
        return id
    }

    fun pin(versionId: UUID, constitutionId: UUID, predecessorVersionId: UUID?) {
        val inherited = predecessorVersionId?.let {
            jdbc.query(
                "SELECT structural_settings_revision_id FROM constitution_versions WHERE id = ?",
                { rs, _ -> rs.getObject("structural_settings_revision_id", UUID::class.java) },
                it,
            ).firstOrNull()
        }
        jdbc.update(
            "UPDATE constitution_versions SET structural_settings_revision_id = ? WHERE id = ?",
            inherited ?: currentId(constitutionId),
            versionId,
        )
    }

    fun forVersion(versionId: UUID): SettingsRevision =
        jdbc.query(
            "SELECT constitution_id, structural_settings_revision_id FROM constitution_versions WHERE id = ?",
            { rs, _ -> rs.getObject("constitution_id", UUID::class.java) to rs.getObject("structural_settings_revision_id", UUID::class.java) },
            versionId,
        ).firstOrNull()?.let { (constitution, revision) -> find(constitution, revision) }
            ?: throw NotFoundException("Unknown version '$versionId'")
}

package com.constitutionatlas.ingestion.repo

import com.constitutionatlas.ingestion.api.SetupProposalDto
import com.constitutionatlas.ingestion.api.SetupProposalRequest
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class SetupProposalRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    private val columns = "id, owner_id, status, payload, constitution_id, settings_revision_id, confirmed_by, revision, previous_payload, requested_changes, changes_requested"
    fun insert(ownerId: UUID, payload: SetupProposalRequest): SetupProposalDto {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO import_setup_proposals (id, owner_id, payload, status) VALUES (?, ?, ?::jsonb, 'proposed')",
            id,
            ownerId,
            mapper.writeValueAsString(payload),
        )
        return find(id)!!
    }

    fun find(id: UUID): SetupProposalDto? = jdbc.query(
        "SELECT $columns FROM import_setup_proposals WHERE id = ? AND (expires_at > now() OR status = 'confirmed')",
        ::map,
        id,
    ).firstOrNull()

    fun replace(id: UUID, payload: SetupProposalRequest, revision: Long): SetupProposalDto? = jdbc.query(
        "UPDATE import_setup_proposals SET previous_payload = payload, payload = ?::jsonb, changes_requested = false, revision = revision + 1, updated_at = now() WHERE id = ? AND revision = ? AND status = 'proposed' AND expires_at > now() RETURNING $columns",
        ::map,
        mapper.writeValueAsString(payload),
        id,
        revision,
    ).firstOrNull()

    fun displayOverrides(id: UUID): com.fasterxml.jackson.databind.JsonNode = mapper.readTree(jdbc.queryForObject("SELECT display_overrides::text FROM import_setup_proposals WHERE id = ?", String::class.java, id))

    fun display(id: UUID, revision: Long, payload: SetupProposalRequest, overrides: com.fasterxml.jackson.databind.JsonNode): SetupProposalDto? = jdbc.query(
        "UPDATE import_setup_proposals SET payload = ?::jsonb, display_overrides = ?::jsonb, revision = revision + 1, updated_at = now() WHERE id = ? AND revision = ? AND status = 'proposed' AND expires_at > now() RETURNING $columns",
        ::map,
        mapper.writeValueAsString(payload),
        mapper.writeValueAsString(overrides),
        id,
        revision,
    ).firstOrNull()

    fun feedback(id: UUID, revision: Long, message: String): SetupProposalDto? = jdbc.query(
        "UPDATE import_setup_proposals SET requested_changes = ?, changes_requested = true, revision = revision + 1, updated_at = now() WHERE id = ? AND revision = ? AND status = 'proposed' AND expires_at > now() RETURNING $columns",
        ::map,
        message,
        id,
        revision,
    ).firstOrNull()

    /** Freeze only the revision the editor actually reviewed. */
    fun claim(id: UUID, revision: Long): SetupProposalDto? = jdbc.query(
        """UPDATE import_setup_proposals SET status = 'confirming', updated_at = now()
           WHERE id = ? AND revision = ? AND NOT changes_requested AND status = 'proposed' AND expires_at > now()
           RETURNING $columns""",
        ::map,
        id,
        revision,
    ).firstOrNull()

    fun setConstitution(id: UUID, constitutionId: UUID) {
        jdbc.update("UPDATE import_setup_proposals SET constitution_id = ?, updated_at = now() WHERE id = ? AND status = 'confirming'", constitutionId, id)
    }

    fun confirm(id: UUID, revisionId: UUID, actorId: UUID) {
        jdbc.update(
            "UPDATE import_setup_proposals SET status = 'confirmed', settings_revision_id = ?, confirmed_by = ?, updated_at = now() WHERE id = ? AND status = 'confirming'",
            revisionId,
            actorId,
            id,
        )
    }

    fun retry(id: UUID) {
        jdbc.update("UPDATE import_setup_proposals SET status = 'proposed', updated_at = now() WHERE id = ? AND status = 'confirming'", id)
    }

    fun withdraw(id: UUID, revision: Long): Boolean = jdbc.update(
        "UPDATE import_setup_proposals SET status = 'withdrawn', updated_at = now() WHERE id = ? AND revision = ? AND status = 'proposed'",
        id,
        revision,
    ) == 1

    private fun map(rs: java.sql.ResultSet, @Suppress("UNUSED_PARAMETER") index: Int): SetupProposalDto = SetupProposalDto(
        rs.getObject("id", UUID::class.java),
        rs.getObject("owner_id", UUID::class.java),
        rs.getString("status"),
        mapper.readValue(rs.getString("payload"), SetupProposalRequest::class.java),
        rs.getObject("constitution_id", UUID::class.java),
        rs.getObject("settings_revision_id", UUID::class.java),
        rs.getObject("confirmed_by", UUID::class.java),
        rs.getLong("revision"),
        rs.getString("previous_payload")?.let { mapper.readValue(it, SetupProposalRequest::class.java) },
        rs.getString("requested_changes"),
        rs.getBoolean("changes_requested"),
    )
}

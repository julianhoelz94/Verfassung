package com.constitutionatlas.ingestion.repo

import com.constitutionatlas.ingestion.api.SetupProposalDto
import com.constitutionatlas.ingestion.api.SetupProposalRequest
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class SetupProposalRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
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
        "SELECT id, owner_id, status, payload, constitution_id, settings_revision_id, confirmed_by FROM import_setup_proposals WHERE id = ? AND (expires_at > now() OR status = 'confirmed')",
        { rs, _ ->
            SetupProposalDto(
                rs.getObject("id", UUID::class.java),
                rs.getObject("owner_id", UUID::class.java),
                rs.getString("status"),
                mapper.readValue(rs.getString("payload"), SetupProposalRequest::class.java),
                rs.getObject("constitution_id", UUID::class.java),
                rs.getObject("settings_revision_id", UUID::class.java),
                rs.getObject("confirmed_by", UUID::class.java),
            )
        },
        id,
    ).firstOrNull()

    fun replace(id: UUID, payload: SetupProposalRequest): Boolean = jdbc.update(
        "UPDATE import_setup_proposals SET payload = ?::jsonb, updated_at = now() WHERE id = ? AND status = 'proposed' AND expires_at > now()",
        mapper.writeValueAsString(payload),
        id,
    ) == 1

    fun claim(id: UUID): Boolean = jdbc.update(
        "UPDATE import_setup_proposals SET status = 'confirming', updated_at = now() WHERE id = ? AND status = 'proposed' AND expires_at > now()",
        id,
    ) == 1

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

    fun withdraw(id: UUID): Boolean = jdbc.update(
        "UPDATE import_setup_proposals SET status = 'withdrawn', updated_at = now() WHERE id = ? AND status = 'proposed'",
        id,
    ) == 1
}

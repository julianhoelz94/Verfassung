package com.constitutionatlas.ingestion.repo

import com.constitutionatlas.ingestion.api.SetupProposalDto
import com.constitutionatlas.ingestion.api.SetupProposalRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.util.UUID

data class SetupConfirmationClaim(val proposal: SetupProposalDto, val attempt: UUID, val operationId: UUID)

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
        "SELECT $columns FROM import_setup_proposals WHERE id = ? AND (expires_at > now() OR status IN ('confirming', 'confirmed'))",
        ::map,
        id,
    ).firstOrNull()

    fun replace(id: UUID, payload: SetupProposalRequest, revision: Long): SetupProposalDto? = jdbc.query(
        "UPDATE import_setup_proposals SET previous_payload = payload, payload = ?::jsonb, changes_requested = false, revision = revision + 1, confirmation_operation = NULL, updated_at = now() WHERE id = ? AND revision = ? AND status = 'proposed' AND expires_at > now() RETURNING $columns",
        ::map,
        mapper.writeValueAsString(payload),
        id,
        revision,
    ).firstOrNull()

    fun displayOverrides(id: UUID): tools.jackson.databind.JsonNode = mapper.readTree(jdbc.queryForObject("SELECT display_overrides::text FROM import_setup_proposals WHERE id = ?", String::class.java, id))

    fun display(id: UUID, revision: Long, payload: SetupProposalRequest, overrides: tools.jackson.databind.JsonNode): SetupProposalDto? = jdbc.query(
        "UPDATE import_setup_proposals SET payload = ?::jsonb, display_overrides = ?::jsonb, revision = revision + 1, confirmation_operation = NULL, updated_at = now() WHERE id = ? AND revision = ? AND status = 'proposed' AND expires_at > now() RETURNING $columns",
        ::map,
        mapper.writeValueAsString(payload),
        mapper.writeValueAsString(overrides),
        id,
        revision,
    ).firstOrNull()

    fun feedback(id: UUID, revision: Long, message: String): SetupProposalDto? = jdbc.query(
        "UPDATE import_setup_proposals SET requested_changes = ?, changes_requested = true, revision = revision + 1, confirmation_operation = NULL, updated_at = now() WHERE id = ? AND revision = ? AND status = 'proposed' AND expires_at > now() RETURNING $columns",
        ::map,
        message,
        id,
        revision,
    ).firstOrNull()

    /** Freeze the reviewed revision; a recovery attempt can only resume this same payload. */
    fun claim(id: UUID, revision: Long): SetupConfirmationClaim? {
        val attempt = UUID.randomUUID()
        return jdbc.query(
            """UPDATE import_setup_proposals
               SET status = 'confirming', confirmation_attempt = ?, confirmation_started_at = now(),
                   confirmation_requested_at = COALESCE(confirmation_requested_at, now()),
                   confirmation_operation = COALESCE(confirmation_operation, ?), updated_at = now()
               WHERE id = ? AND revision = ? AND NOT changes_requested AND (
                 (status = 'proposed' AND expires_at > now()) OR
                 (status = 'confirming' AND (confirmation_started_at IS NULL OR confirmation_started_at < now() - interval '2 minutes'))
               ) RETURNING $columns, confirmation_operation""",
            { rs, index -> SetupConfirmationClaim(map(rs, index), attempt, rs.getObject("confirmation_operation", UUID::class.java)) },
            attempt,
            UUID.randomUUID(),
            id,
            revision,
        ).firstOrNull()
    }

    fun confirm(id: UUID, attempt: UUID, constitutionId: UUID, revisionId: UUID, actorId: UUID): Boolean =
        jdbc.update(
            "UPDATE import_setup_proposals SET status = 'confirmed', constitution_id = ?, settings_revision_id = ?, confirmed_by = ?, confirmation_attempt = NULL, confirmation_started_at = NULL, updated_at = now() WHERE id = ? AND status = 'confirming' AND confirmation_attempt = ?",
            constitutionId,
            revisionId,
            actorId,
            id,
            attempt,
        ) == 1

    fun retry(id: UUID, attempt: UUID) {
        jdbc.update("UPDATE import_setup_proposals SET confirmation_attempt = NULL, confirmation_started_at = NULL, updated_at = now() WHERE id = ? AND status = 'confirming' AND confirmation_attempt = ?", id, attempt)
    }

    fun rejectWithoutWrites(id: UUID, attempt: UUID): Boolean = jdbc.update(
        "UPDATE import_setup_proposals SET status = 'proposed', confirmation_attempt = NULL, confirmation_started_at = NULL, confirmation_requested_at = NULL, updated_at = now() WHERE id = ? AND status = 'confirming' AND confirmation_attempt = ? AND constitution_id IS NULL AND NOT confirmation_legacy",
        id,
        attempt,
    ) == 1

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

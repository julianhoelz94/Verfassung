package com.constitutionatlas.editor.repo

import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.api.DraftSource
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

data class DraftPin(val sourceGeneration: Long, val settingsRevisionId: UUID, val rootRevisionIds: List<UUID>, val generation: Long)

@Repository
class StructuredDraftRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun lockSession(session: UUID) {
        jdbc.query("SELECT id FROM edit_sessions WHERE id = ? FOR UPDATE", { rs, _ -> rs.getObject(1, UUID::class.java) }, session)
    }

    fun pin(session: UUID): DraftPin? = jdbc.query(
        "SELECT source_generation, settings_revision_id, root_revision_ids, generation FROM structured_draft_sources WHERE session_id = ?",
        { rs, _ -> DraftPin(rs.getLong(1), rs.getObject(2, UUID::class.java), (rs.getArray(3).array as Array<*>).map { UUID.fromString(it.toString()) }, rs.getLong(4)) },
        session,
    ).firstOrNull()

    fun createPin(session: UUID, source: DraftSource, settingsId: UUID) {
        jdbc.update({ connection ->
            connection.prepareStatement("INSERT INTO structured_draft_sources(session_id, source_generation, settings_revision_id, root_revision_ids) VALUES (?, ?, ?, ?)").apply {
                setObject(1, session)
                setLong(2, source.generation)
                setObject(3, settingsId)
                setArray(4, connection.createArrayOf("uuid", source.roots.map { it.revisionId!! }.toTypedArray()))
            }
        })
    }

    fun operations(session: UUID): List<DraftOperation> = jdbc.query(
        "SELECT payload::text FROM structured_draft_operations WHERE session_id = ? ORDER BY sequence",
        { rs, _ -> mapper.readValue(rs.getString(1), DraftOperation::class.java) },
        session,
    )

    fun append(session: UUID, operations: List<DraftOperation>) {
        var sequence = jdbc.queryForObject("SELECT COALESCE(MAX(sequence), 0) FROM structured_draft_operations WHERE session_id = ?", Long::class.java, session)!!
        operations.forEach { operation -> jdbc.update("INSERT INTO structured_draft_operations(id, session_id, sequence, payload) VALUES (?, ?, ?, ?::jsonb)", operation.id, session, ++sequence, mapper.writeValueAsString(operation)) }
        jdbc.update("UPDATE structured_draft_sources SET generation = generation + 1 WHERE session_id = ?", session)
        jdbc.update("UPDATE edit_sessions SET updated_at = now() WHERE id = ?", session)
    }
}

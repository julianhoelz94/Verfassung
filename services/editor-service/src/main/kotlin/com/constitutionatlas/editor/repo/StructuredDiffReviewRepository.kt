package com.constitutionatlas.editor.repo

import com.constitutionatlas.platform.DiffItem
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

data class DiffReviewPin(val sourceVersionId: UUID, val sourceGeneration: Long, val settingsRevisionId: UUID, val draftGeneration: Long, val algorithmVersion: String)
data class DiffDecisionRow(val key: String, val fingerprint: String, val status: String, val linkedRowIds: List<UUID>, val reason: String?, val reviewerAcknowledged: Boolean)

@Repository
class StructuredDiffReviewRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun candidates(sessionId: UUID): List<DiffItem> = jdbc.query(
        "SELECT candidates::text FROM structured_diff_runs WHERE session_id = ?",
        { rs, _ -> mapper.readValue(rs.getString(1), object : TypeReference<List<DiffItem>>() {}) },
        sessionId,
    ).firstOrNull().orEmpty()

    fun pin(sessionId: UUID): DiffReviewPin? = jdbc.query(
        "SELECT source_version_id, source_generation, settings_revision_id, draft_generation, algorithm_version FROM structured_diff_runs WHERE session_id = ?",
        { rs, _ -> DiffReviewPin(rs.getObject(1, UUID::class.java), rs.getLong(2), rs.getObject(3, UUID::class.java), rs.getLong(4), rs.getString(5)) },
        sessionId,
    ).firstOrNull()

    fun saveRun(sessionId: UUID, pin: DiffReviewPin, items: List<DiffItem>) {
        jdbc.update(
            "INSERT INTO structured_diff_runs(session_id, source_version_id, source_generation, settings_revision_id, draft_generation, algorithm_version, candidates) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb) ON CONFLICT (session_id) DO UPDATE SET source_version_id = EXCLUDED.source_version_id, source_generation = EXCLUDED.source_generation, settings_revision_id = EXCLUDED.settings_revision_id, draft_generation = EXCLUDED.draft_generation, algorithm_version = EXCLUDED.algorithm_version, candidates = EXCLUDED.candidates, updated_at = now()",
            sessionId,
            pin.sourceVersionId,
            pin.sourceGeneration,
            pin.settingsRevisionId,
            pin.draftGeneration,
            pin.algorithmVersion,
            mapper.writeValueAsString(items),
        )
    }

    fun decisions(sessionId: UUID): List<DiffDecisionRow> = jdbc.query(
        "SELECT candidate_key, fingerprint, status, linked_row_ids, exclusion_reason, reviewer_acknowledged FROM structured_diff_decisions WHERE session_id = ?",
        { rs, _ -> DiffDecisionRow(rs.getString(1), rs.getString(2), rs.getString(3), (rs.getArray(4).array as Array<*>).map { UUID.fromString(it.toString()) }, rs.getString(5), rs.getBoolean(6)) },
        sessionId,
    )

    fun deleteDecision(sessionId: UUID, key: String) {
        jdbc.update("DELETE FROM structured_diff_decisions WHERE session_id = ? AND candidate_key = ?", sessionId, key)
    }
    fun markRecheck(sessionId: UUID, key: String, fingerprint: String) {
        jdbc.update("UPDATE structured_diff_decisions SET fingerprint = ?, status = 'needs_recheck', linked_row_ids = '{}', exclusion_reason = NULL, reviewer_acknowledged = FALSE WHERE session_id = ? AND candidate_key = ?", fingerprint, sessionId, key)
    }

    fun saveDecision(sessionId: UUID, decision: DiffDecisionRow) {
        jdbc.update({ connection ->
            connection.prepareStatement("INSERT INTO structured_diff_decisions(session_id, candidate_key, fingerprint, status, linked_row_ids, exclusion_reason, reviewer_acknowledged) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (session_id, candidate_key) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, status = EXCLUDED.status, linked_row_ids = EXCLUDED.linked_row_ids, exclusion_reason = EXCLUDED.exclusion_reason, reviewer_acknowledged = EXCLUDED.reviewer_acknowledged").apply {
                setObject(1, sessionId)
                setString(2, decision.key)
                setString(3, decision.fingerprint)
                setString(4, decision.status)
                setArray(5, connection.createArrayOf("uuid", decision.linkedRowIds.toTypedArray()))
                setString(6, decision.reason)
                setBoolean(7, decision.reviewerAcknowledged)
            }
        })
    }
}

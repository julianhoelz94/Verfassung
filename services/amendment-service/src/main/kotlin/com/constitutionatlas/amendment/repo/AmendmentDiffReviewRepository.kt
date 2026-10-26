package com.constitutionatlas.amendment.repo

import com.constitutionatlas.platform.DiffItem
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

data class AmendmentDiffPin(val sourceVersionId: UUID, val targetVersionId: UUID, val algorithmVersion: String)
data class AmendmentDiffDecision(val key: String, val fingerprint: String, val status: String, val linkedChangeIds: List<UUID>, val reason: String?, val reviewerAcknowledged: Boolean)

@Repository
class AmendmentDiffReviewRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun pin(revisionId: UUID): AmendmentDiffPin? = jdbc.query(
        "SELECT source_version_id, target_version_id, algorithm_version FROM amendment_diff_runs WHERE revision_id = ?",
        { rs, _ -> AmendmentDiffPin(rs.getObject(1, UUID::class.java), rs.getObject(2, UUID::class.java), rs.getString(3)) },
        revisionId,
    ).firstOrNull()

    fun saveRun(revisionId: UUID, pin: AmendmentDiffPin, candidates: List<DiffItem>) {
        jdbc.update(
            "INSERT INTO amendment_diff_runs(revision_id, source_version_id, target_version_id, algorithm_version, candidates) VALUES (?, ?, ?, ?, ?::jsonb) ON CONFLICT (revision_id) DO UPDATE SET source_version_id = EXCLUDED.source_version_id, target_version_id = EXCLUDED.target_version_id, algorithm_version = EXCLUDED.algorithm_version, candidates = EXCLUDED.candidates, updated_at = now()",
            revisionId,
            pin.sourceVersionId,
            pin.targetVersionId,
            pin.algorithmVersion,
            mapper.writeValueAsString(candidates),
        )
    }

    fun decisions(revisionId: UUID): List<AmendmentDiffDecision> = jdbc.query(
        "SELECT candidate_key, fingerprint, status, linked_change_ids, exclusion_reason, reviewer_acknowledged FROM amendment_diff_decisions WHERE revision_id = ?",
        { rs, _ -> AmendmentDiffDecision(rs.getString(1), rs.getString(2), rs.getString(3), (rs.getArray(4).array as Array<*>).map { UUID.fromString(it.toString()) }, rs.getString(5), rs.getBoolean(6)) },
        revisionId,
    )

    fun delete(revisionId: UUID, key: String) {
        jdbc.update("DELETE FROM amendment_diff_decisions WHERE revision_id = ? AND candidate_key = ?", revisionId, key)
    }
    fun markRecheck(revisionId: UUID, key: String, fingerprint: String) {
        jdbc.update("UPDATE amendment_diff_decisions SET fingerprint = ?, status = 'needs_recheck', linked_change_ids = '{}', exclusion_reason = NULL, reviewer_acknowledged = FALSE WHERE revision_id = ? AND candidate_key = ?", fingerprint, revisionId, key)
    }
    fun saveDecision(revisionId: UUID, decision: AmendmentDiffDecision) {
        jdbc.update({ connection ->
            connection.prepareStatement("INSERT INTO amendment_diff_decisions(revision_id, candidate_key, fingerprint, status, linked_change_ids, exclusion_reason, reviewer_acknowledged) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (revision_id, candidate_key) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, status = EXCLUDED.status, linked_change_ids = EXCLUDED.linked_change_ids, exclusion_reason = EXCLUDED.exclusion_reason, reviewer_acknowledged = EXCLUDED.reviewer_acknowledged").apply {
                setObject(1, revisionId)
                setString(2, decision.key)
                setString(3, decision.fingerprint)
                setString(4, decision.status)
                setArray(5, connection.createArrayOf("uuid", decision.linkedChangeIds.toTypedArray()))
                setString(6, decision.reason)
                setBoolean(7, decision.reviewerAcknowledged)
            }
        })
    }
}

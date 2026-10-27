package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.CreateCuratedComparison
import com.constitutionatlas.catalog.api.CuratedComparison
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Repository
class CuratedComparisonRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun lock(attempt: UUID) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", { _, _ -> Unit }, "comparison:$attempt")
    }
    fun attempt(attempt: UUID): Pair<UUID, String>? = jdbc.query("SELECT id, request_sha256 FROM curated_archive_comparisons WHERE attempt_id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) to rs.getString(2) }, attempt).firstOrNull()
    fun create(owner: UUID, request: CreateCuratedComparison, hash: String): UUID {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO curated_archive_comparisons(id, owner_id, attempt_id, request_sha256, definition) VALUES (?, ?, ?, ?, ?::jsonb)", id, owner, request.attemptId, hash, mapper.writeValueAsString(request))
        return id
    }
    fun find(id: UUID): CuratedComparison? = jdbc.query("SELECT id, state, definition, review_reason FROM curated_archive_comparisons WHERE id = ?", { rs, _ -> CuratedComparison(rs.getObject(1, UUID::class.java), rs.getString(2), mapper.readValue(rs.getString(3), CreateCuratedComparison::class.java), false, rs.getString(4)) }, id).firstOrNull()
    fun list(staff: Boolean): List<UUID> = jdbc.query("SELECT id FROM curated_archive_comparisons WHERE (? OR state = 'published') ORDER BY created_at DESC, id LIMIT 100", { rs, _ -> rs.getObject(1, UUID::class.java) }, staff)
    fun review(id: UUID, actor: UUID, reason: String): Boolean = jdbc.update("UPDATE curated_archive_comparisons SET state = 'reviewed', reviewed_by = ?, review_reason = ? WHERE id = ? AND state IN ('draft', 'reviewed')", actor, reason, id) == 1
    fun publish(id: UUID, actor: UUID): Boolean = jdbc.update("UPDATE curated_archive_comparisons SET state = 'published', published_by = ? WHERE id = ? AND state = 'reviewed'", actor, id) == 1
}

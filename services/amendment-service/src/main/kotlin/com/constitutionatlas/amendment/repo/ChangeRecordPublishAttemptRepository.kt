package com.constitutionatlas.amendment.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

data class ChangeRecordAttempt(val constitutionId: UUID, val amendmentId: UUID, val revisionId: UUID, val requestHash: String)

@Repository
class ChangeRecordPublishAttemptRepository(private val jdbc: JdbcTemplate) {
    fun lock(id: UUID) {
        jdbc.execute("SELECT pg_advisory_xact_lock(${id.mostSignificantBits.toInt()}, ${id.leastSignificantBits.toInt()})")
    }
    fun find(id: UUID): ChangeRecordAttempt? = jdbc.query("SELECT constitution_id, amendment_id, revision_id, request_hash FROM change_record_publish_attempts WHERE id = ?", { rs, _ -> ChangeRecordAttempt(rs.getObject(1, UUID::class.java), rs.getObject(2, UUID::class.java), rs.getObject(3, UUID::class.java), rs.getString(4)) }, id).firstOrNull()
    fun insert(id: UUID, constitution: UUID, amendment: UUID, revision: UUID, hash: String) {
        jdbc.update("INSERT INTO change_record_publish_attempts(id, constitution_id, amendment_id, revision_id, request_hash) VALUES (?, ?, ?, ?, ?)", id, constitution, amendment, revision, hash)
    }
}

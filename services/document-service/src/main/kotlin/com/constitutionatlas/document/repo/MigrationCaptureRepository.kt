package com.constitutionatlas.document.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class MigrationCaptureRepository(private val jdbc: JdbcTemplate) {
    fun lock(owner: UUID, attempt: UUID) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", { _, _ -> Unit }, "$owner:$attempt")
    }
    fun find(owner: UUID, attempt: UUID): Triple<String, UUID, Int>? = jdbc.query(
        "SELECT request_sha256, document_id, revision_number FROM migration_capture_attempts WHERE owner_id = ? AND attempt_id = ?",
        { rs, _ -> Triple(rs.getString(1), rs.getObject(2, UUID::class.java), rs.getInt(3)) },
        owner,
        attempt,
    ).firstOrNull()
    fun save(owner: UUID, attempt: UUID, hash: String, document: UUID, revision: Int) {
        jdbc.update("INSERT INTO migration_capture_attempts(owner_id, attempt_id, request_sha256, document_id, revision_number) VALUES (?, ?, ?, ?, ?)", owner, attempt, hash, document, revision)
    }
}

package com.constitutionatlas.editor.repo

import com.constitutionatlas.editor.ConflictException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
class StructuredPublishJobRepository(private val jdbc: JdbcTemplate) {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun pin(session: UUID, request: String) {
        val hash = java.security.MessageDigest.getInstance("SHA-256").digest(request.toByteArray()).joinToString("") { "%02x".format(it) }
        jdbc.update("INSERT INTO structured_publish_jobs(session_id, request_hash) VALUES (?, ?) ON CONFLICT DO NOTHING", session, hash)
        val existing = jdbc.queryForObject("SELECT request_hash FROM structured_publish_jobs WHERE session_id = ?", String::class.java, session)
        if (existing != hash) throw ConflictException("Publish attempt payload changed", "publish_attempt_mismatch")
    }

    fun amendment(session: UUID): UUID? = jdbc.query("SELECT amendment_id FROM structured_publish_jobs WHERE session_id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, session).firstOrNull()

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun recordAmendment(session: UUID, amendment: UUID) {
        jdbc.update("UPDATE structured_publish_jobs SET amendment_id = ? WHERE session_id = ?", amendment, session)
    }
}

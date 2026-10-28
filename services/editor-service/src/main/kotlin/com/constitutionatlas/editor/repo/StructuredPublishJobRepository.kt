package com.constitutionatlas.editor.repo

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.PublishRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
class StructuredPublishJobRepository(private val jdbc: JdbcTemplate) {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun pin(session: UUID, request: PublishRequest) {
        // Freeze the persisted format instead of inheriting future data-class fields.
        val original = "PublishRequest(hopKind=${request.hopKind}, amendmentId=${request.amendmentId}, comment=${request.comment}, changeRecord=${request.changeRecord})"
        val current = original.dropLast(1) + ", sourceEvidenceRevision=${request.sourceEvidenceRevision})"
        val hash = hash(current)
        // Requests pinned before source review existed have no revision field.
        val compatibleHash = if (request.sourceEvidenceRevision == null) hash(original) else null
        jdbc.update("INSERT INTO structured_publish_jobs(session_id, request_hash) VALUES (?, ?) ON CONFLICT DO NOTHING", session, hash)
        val existing = jdbc.queryForObject("SELECT request_hash FROM structured_publish_jobs WHERE session_id = ?", String::class.java, session)
        if (existing != hash && existing != compatibleHash) throw ConflictException("Publish attempt payload changed", "publish_attempt_mismatch")
    }

    private fun hash(request: String): String = java.security.MessageDigest.getInstance("SHA-256").digest(request.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    fun amendment(session: UUID): UUID? = jdbc.query("SELECT amendment_id FROM structured_publish_jobs WHERE session_id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, session).firstOrNull()

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun recordAmendment(session: UUID, amendment: UUID) {
        jdbc.update("UPDATE structured_publish_jobs SET amendment_id = ? WHERE session_id = ?", amendment, session)
    }
}

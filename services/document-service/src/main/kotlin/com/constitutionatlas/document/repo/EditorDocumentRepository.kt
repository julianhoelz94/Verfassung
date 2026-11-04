package com.constitutionatlas.document.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class EditorDocumentRepository(private val jdbc: JdbcTemplate) {
    fun lock(actor: UUID, operation: UUID) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", { _, _ -> Unit }, "editor-document:$actor:$operation")
    }

    fun find(actor: UUID, operation: UUID): Triple<String, UUID, Int>? = jdbc.query(
        "SELECT request_sha256, document_id, revision_number FROM editor_document_operations WHERE actor_id = ? AND operation_id = ?",
        { rs, _ -> Triple(rs.getString(1), rs.getObject(2, UUID::class.java), rs.getInt(3)) },
        actor,
        operation,
    ).firstOrNull()

    fun save(actor: UUID, operation: UUID, hash: String, document: UUID, revision: Int) {
        jdbc.update("INSERT INTO editor_document_operations(actor_id, operation_id, request_sha256, document_id, revision_number) VALUES (?, ?, ?, ?, ?)", actor, operation, hash, document, revision)
    }
}

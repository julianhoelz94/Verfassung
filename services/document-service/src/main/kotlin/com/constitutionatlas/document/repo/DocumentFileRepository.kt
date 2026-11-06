package com.constitutionatlas.document.repo

import com.constitutionatlas.document.api.DocumentAttachmentDto
import com.constitutionatlas.document.service.DocumentFileValidation
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.security.MessageDigest
import java.sql.ResultSet
import java.util.UUID

@Repository
class DocumentFileRepository(private val jdbc: JdbcTemplate) {
    fun attachments(revisionId: UUID): List<DocumentAttachmentDto> =
        jdbc.query(
            """SELECT f.id, f.file_name, f.content_type, f.size_bytes, f.sha256, a.is_primary
               FROM document_revision_attachments a JOIN document_files f ON f.id = a.file_id
               WHERE a.revision_id = ? ORDER BY a.position, f.id""",
            { rs, _ -> attachment(rs) },
            revisionId,
        )

    fun primaryBytes(revisionId: UUID): ByteArray? =
        jdbc.query(
            """SELECT f.file_bytes FROM document_revision_attachments a
               JOIN document_files f ON f.id = a.file_id WHERE a.revision_id = ? AND a.is_primary""",
            { rs, _ -> rs.getBytes(1) },
            revisionId,
        ).firstOrNull()

    fun file(revisionId: UUID, attachmentId: UUID): Pair<DocumentAttachmentDto, ByteArray>? =
        jdbc.query(
            """SELECT f.id, f.file_name, f.content_type, f.size_bytes, f.sha256, a.is_primary, f.file_bytes
               FROM document_revision_attachments a JOIN document_files f ON f.id = a.file_id
               WHERE a.revision_id = ? AND f.id = ?""",
            { rs, _ -> attachment(rs) to rs.getBytes("file_bytes") },
            revisionId,
            attachmentId,
        ).firstOrNull()

    fun copy(sourceRevisionId: UUID, newRevisionId: UUID) {
        jdbc.update(
            """INSERT INTO document_revision_attachments (revision_id, file_id, position, is_primary)
               SELECT ?, file_id, position, is_primary FROM document_revision_attachments WHERE revision_id = ?""",
            newRevisionId,
            sourceRevisionId,
        )
    }

    /** Only called for a new revision in the transaction which created it. */
    fun storePrimary(revisionId: UUID, fileName: String, contentType: String, bytes: ByteArray) {
        val fileId = store(fileName, contentType, bytes)
        jdbc.update("DELETE FROM document_revision_attachments WHERE revision_id = ? AND is_primary", revisionId)
        jdbc.update("UPDATE document_revision_attachments SET is_primary = false WHERE revision_id = ?", revisionId)
        val existing = jdbc.queryForObject(
            "SELECT count(*) FROM document_revision_attachments WHERE revision_id = ? AND file_id = ?",
            Int::class.java,
            revisionId,
            fileId,
        ) ?: 0
        if (existing == 0) {
            jdbc.update(
                """INSERT INTO document_revision_attachments (revision_id, file_id, position, is_primary)
                   VALUES (?, ?, (SELECT COALESCE(max(position), -1) + 1 FROM document_revision_attachments WHERE revision_id = ?), true)""",
                revisionId,
                fileId,
                revisionId,
            )
        } else {
            jdbc.update("UPDATE document_revision_attachments SET is_primary = true WHERE revision_id = ? AND file_id = ?", revisionId, fileId)
        }
    }

    fun add(revisionId: UUID, fileName: String, contentType: String, bytes: ByteArray) {
        val fileId = store(fileName, contentType, bytes)
        jdbc.update(
            """INSERT INTO document_revision_attachments (revision_id, file_id, position, is_primary)
               VALUES (?, ?, (SELECT COALESCE(max(position), -1) + 1 FROM document_revision_attachments WHERE revision_id = ?),
                       NOT EXISTS (SELECT 1 FROM document_revision_attachments WHERE revision_id = ?))
               ON CONFLICT (revision_id, file_id) DO NOTHING""",
            revisionId,
            fileId,
            revisionId,
            revisionId,
        )
    }

    fun remove(revisionId: UUID, attachmentId: UUID) {
        jdbc.update("DELETE FROM document_revision_attachments WHERE revision_id = ? AND file_id = ?", revisionId, attachmentId)
        if (attachments(revisionId).none { it.primary }) {
            jdbc.update(
                """UPDATE document_revision_attachments SET is_primary = true WHERE revision_id = ? AND file_id =
                   (SELECT file_id FROM document_revision_attachments WHERE revision_id = ? ORDER BY position, file_id LIMIT 1)""",
                revisionId,
                revisionId,
            )
        }
    }

    fun setPrimary(revisionId: UUID, attachmentId: UUID) {
        jdbc.update("UPDATE document_revision_attachments SET is_primary = false WHERE revision_id = ?", revisionId)
        jdbc.update("UPDATE document_revision_attachments SET is_primary = true WHERE revision_id = ? AND file_id = ?", revisionId, attachmentId)
    }

    fun validate(fileName: String, contentType: String, bytes: ByteArray) = DocumentFileValidation.validate(fileName, contentType, bytes)

    private fun store(fileName: String, contentType: String, bytes: ByteArray): UUID {
        validate(fileName, contentType, bytes)
        val id = UUID.randomUUID()
        val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        // Concurrent equal uploads share immutable bytes without changing attribution
        // or bytes on an existing file row.
        jdbc.update(
            """INSERT INTO document_files (id, file_name, content_type, file_bytes, size_bytes, sha256)
               VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (sha256, file_name, content_type) DO NOTHING""",
            id,
            fileName.trim(),
            contentType,
            bytes,
            bytes.size.toLong(),
            sha256,
        )
        return jdbc.queryForObject(
            "SELECT id FROM document_files WHERE sha256 = ? AND file_name = ? AND content_type = ?",
            UUID::class.java,
            sha256,
            fileName.trim(),
            contentType,
        )!!
    }

    private fun attachment(rs: ResultSet): DocumentAttachmentDto =
        DocumentAttachmentDto(
            rs.getObject("id", UUID::class.java),
            rs.getString("file_name"),
            rs.getString("content_type"),
            rs.getLong("size_bytes"),
            rs.getString("sha256"),
            rs.getBoolean("is_primary"),
        )
}

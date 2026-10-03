package com.constitutionatlas.document.repo

import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.DocumentEventDto
import com.constitutionatlas.document.api.DocumentLinkEventDto
import com.constitutionatlas.document.api.DocumentRevisionDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.ZoneOffset
import java.util.UUID

@Repository
class DocumentRepository(private val jdbc: JdbcTemplate) {
    private val documentSelect =
        """SELECT d.id, d.current_revision, d.status, d.created_at, r.id AS revision_id,
                  r.revision, r.title, r.description, r.source_url, r.file_name,
                  r.content_type, r.created_at AS revision_created_at, r.created_by
           FROM documents d JOIN document_revisions r ON r.document_id = d.id"""

    fun list(query: String?): List<DocumentDto> {
        val term = query?.trim().orEmpty()
        return jdbc.query(
            "$documentSelect WHERE r.revision = d.current_revision AND (? = '' OR r.title ILIKE '%' || ? || '%') ORDER BY d.created_at DESC",
            { rs, _ -> document(rs) },
            term,
            term,
        )
    }

    fun get(id: UUID, revision: Int? = null): DocumentDto? =
        jdbc.query(
            "$documentSelect WHERE d.id = ? AND r.revision = COALESCE(?, d.current_revision)",
            { rs, _ -> document(rs) },
            id,
            revision,
        ).firstOrNull()

    fun revisionById(id: UUID): DocumentRevisionDto? =
        jdbc.query(
            """SELECT id AS revision_id, document_id, revision, title, description, source_url,
                      file_name, content_type, created_at AS revision_created_at, created_by
               FROM document_revisions WHERE id = ?""",
            { rs, _ -> revision(rs, rs.getObject("document_id", UUID::class.java)) },
            id,
        ).firstOrNull()

    fun revisions(id: UUID): List<DocumentRevisionDto> =
        jdbc.query(
            """SELECT id AS revision_id, document_id, revision, title, description, source_url,
                      file_name, content_type, created_at AS revision_created_at, created_by
               FROM document_revisions WHERE document_id = ? ORDER BY revision DESC""",
            { rs, _ -> revision(rs, id) },
            id,
        )

    fun file(revisionId: UUID): ByteArray? =
        jdbc.query("SELECT file_bytes FROM document_revisions WHERE id = ?", { rs, _ -> rs.getBytes(1) }, revisionId).firstOrNull()

    fun insertDocument(id: UUID, actorId: UUID) {
        jdbc.update("INSERT INTO documents (id, created_by) VALUES (?, ?)", id, actorId)
    }

    fun advance(id: UUID, expected: Int): Boolean =
        jdbc.update(
            "UPDATE documents SET current_revision = current_revision + 1 WHERE id = ? AND current_revision = ? AND status = 'active'",
            id,
            expected,
        ) == 1

    fun insertRevision(
        id: UUID,
        documentId: UUID,
        number: Int,
        title: String,
        description: String?,
        sourceUrl: String?,
        fileName: String?,
        contentType: String?,
        bytes: ByteArray?,
        actorId: UUID,
    ) {
        jdbc.update(
            """INSERT INTO document_revisions
               (id, document_id, revision, title, description, source_url, file_name, content_type, file_bytes, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            id, documentId, number, title, description, sourceUrl, fileName, contentType, bytes, actorId,
        )
    }

    fun archive(id: UUID): Boolean =
        jdbc.update("UPDATE documents SET status = 'archived' WHERE id = ? AND status = 'active'", id) == 1

    fun event(documentId: UUID, eventType: String, actorId: UUID, revisionId: UUID?) {
        jdbc.update(
            "INSERT INTO document_events (id, document_id, event_type, actor_id, revision_id) VALUES (?, ?, ?, ?, ?)",
            UUID.randomUUID(),
            documentId,
            eventType,
            actorId,
            revisionId,
        )
    }

    fun events(id: UUID): List<DocumentEventDto> =
        jdbc.query(
            "SELECT id, document_id, event_type, actor_id, occurred_at, revision_id FROM document_events WHERE document_id = ? ORDER BY occurred_at DESC, id DESC",
            { rs, _ ->
                DocumentEventDto(
                    rs.getObject("id", UUID::class.java),
                    id,
                    rs.getString("event_type"),
                    rs.getObject("actor_id", UUID::class.java),
                    rs.getTimestamp("occurred_at").toInstant().atOffset(ZoneOffset.UTC),
                    rs.getObject("revision_id", UUID::class.java),
                )
            },
            id,
        )

    fun linkEvent(targetType: String, targetId: UUID, documentId: UUID, revisionId: UUID?, action: String, actorId: UUID) {
        jdbc.update(
            """INSERT INTO document_link_events (id, target_type, target_id, document_id, revision_id, action, actor_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            UUID.randomUUID(),
            targetType,
            targetId,
            documentId,
            revisionId,
            action,
            actorId,
        )
    }

    fun linkEvents(targetType: String, targetId: UUID): List<DocumentLinkEventDto> =
        jdbc.query(
            """SELECT id, target_type, target_id, document_id, revision_id, action, actor_id, occurred_at
               FROM document_link_events WHERE target_type = ? AND target_id = ? ORDER BY occurred_at DESC, id DESC""",
            { rs, _ ->
                DocumentLinkEventDto(
                    rs.getObject("id", UUID::class.java),
                    rs.getString("target_type"),
                    rs.getObject("target_id", UUID::class.java),
                    rs.getObject("document_id", UUID::class.java),
                    rs.getObject("revision_id", UUID::class.java),
                    rs.getString("action"),
                    rs.getObject("actor_id", UUID::class.java),
                    rs.getTimestamp("occurred_at").toInstant().atOffset(ZoneOffset.UTC),
                )
            },
            targetType,
            targetId,
        )

    private fun document(rs: ResultSet): DocumentDto {
        val id = rs.getObject("id", UUID::class.java)
        return DocumentDto(
            id,
            rs.getInt("current_revision"),
            rs.getString("status"),
            rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            revision(rs, id),
        )
    }

    private fun revision(rs: ResultSet, documentId: UUID): DocumentRevisionDto =
        DocumentRevisionDto(
            rs.getObject("revision_id", UUID::class.java), documentId, rs.getInt("revision"),
            rs.getString("title"), rs.getString("description"), rs.getString("source_url"),
            rs.getString("file_name"), rs.getString("content_type"),
            rs.getTimestamp("revision_created_at").toInstant().atOffset(ZoneOffset.UTC),
            rs.getObject("created_by", UUID::class.java),
        )
}

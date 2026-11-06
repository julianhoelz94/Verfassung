package com.constitutionatlas.document.repo

import com.constitutionatlas.document.api.BibliographyDto
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.DocumentEventDto
import com.constitutionatlas.document.api.DocumentLinkEventDto
import com.constitutionatlas.document.api.DocumentRevisionDto
import com.constitutionatlas.document.api.DocumentTagDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.ZoneOffset
import java.util.UUID

@Repository
class DocumentRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper, private val files: DocumentFileRepository) {
    private val documentSelect =
        """SELECT d.id, d.current_revision, d.status, d.created_at, r.id AS revision_id,
                  r.revision, r.title, r.description, r.source_url, r.file_name,
                  r.content_type, r.created_at AS revision_created_at, r.created_by, d.citation_key AS current_key, r.citation_key, r.bibliography
           FROM documents d JOIN document_revisions r ON r.document_id = d.id"""

    fun list(query: String?): List<DocumentDto> {
        val term = query?.trim().orEmpty()
        return jdbc.query(
            "$documentSelect WHERE r.revision = d.current_revision AND (? = '' OR r.title ILIKE '%' || ? || '%' OR d.citation_key ILIKE '%' || ? || '%' OR r.bibliography::text ILIKE '%' || ? || '%') ORDER BY d.created_at DESC",
            { rs, _ -> document(rs) },
            term,
            term,
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
                      file_name, content_type, created_at AS revision_created_at, created_by, citation_key, bibliography
               FROM document_revisions WHERE id = ?""",
            { rs, _ -> revision(rs, rs.getObject("document_id", UUID::class.java)) },
            id,
        ).firstOrNull()

    fun revisions(id: UUID): List<DocumentRevisionDto> =
        jdbc.query(
            """SELECT id AS revision_id, document_id, revision, title, description, source_url,
                      file_name, content_type, created_at AS revision_created_at, created_by, citation_key, bibliography
               FROM document_revisions WHERE document_id = ? ORDER BY revision DESC""",
            { rs, _ -> revision(rs, id) },
            id,
        )

    fun file(revisionId: UUID): ByteArray? =
        files.primaryBytes(revisionId) ?: jdbc.query("SELECT file_bytes FROM document_revisions WHERE id = ?", { rs, _ -> rs.getBytes(1) }, revisionId).firstOrNull()

    fun insertDocument(id: UUID, actorId: UUID, citationKey: String = "doc-$id") {
        jdbc.update("INSERT INTO documents (id, created_by, citation_key) VALUES (?, ?, ?)", id, actorId, citationKey)
    }

    fun lockDocument(id: UUID) {
        jdbc.query("SELECT id FROM documents WHERE id = ? FOR UPDATE", { rs, _ -> rs.getObject("id", UUID::class.java) }, id)
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
               (id, document_id, revision, title, description, source_url, file_name, content_type, file_bytes, created_by, citation_key)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT citation_key FROM documents WHERE id = ?))""",
            id, documentId, number, title, description, sourceUrl, fileName, contentType, bytes, actorId, documentId,
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

    fun linkEvent(targetType: String, targetId: UUID, scopeRevisionId: UUID?, documentId: UUID, revisionId: UUID?, action: String, actorId: UUID, citationNote: String? = null) {
        jdbc.update(
            """INSERT INTO document_link_events (id, target_type, target_id, scope_revision_id, document_id, revision_id, action, actor_id, citation_note)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            UUID.randomUUID(),
            targetType,
            targetId,
            scopeRevisionId,
            documentId,
            revisionId,
            action,
            actorId,
            citationNote,
        )
    }

    fun linkEvents(targetType: String, targetId: UUID, scopeRevisionId: UUID?): List<DocumentLinkEventDto> =
        jdbc.query(
            """SELECT id, target_type, target_id, document_id, revision_id, scope_revision_id, action, actor_id, occurred_at, citation_note
               FROM document_link_events WHERE target_type = ? AND target_id = ? AND scope_revision_id IS NOT DISTINCT FROM ?
               ORDER BY occurred_at DESC, id DESC""",
            { rs, _ ->
                DocumentLinkEventDto(
                    rs.getObject("id", UUID::class.java),
                    rs.getString("target_type"),
                    rs.getObject("target_id", UUID::class.java),
                    rs.getObject("document_id", UUID::class.java),
                    rs.getObject("revision_id", UUID::class.java),
                    rs.getObject("scope_revision_id", UUID::class.java),
                    rs.getString("action"),
                    rs.getObject("actor_id", UUID::class.java),
                    rs.getTimestamp("occurred_at").toInstant().atOffset(ZoneOffset.UTC),
                    rs.getString("citation_note"),
                )
            },
            targetType,
            targetId,
            scopeRevisionId,
        )

    fun activeLinksForDocument(documentId: UUID): List<DocumentLinkEventDto> =
        jdbc.query(
            """SELECT DISTINCT ON (target_type, target_id, scope_revision_id) id, target_type, target_id,
                      document_id, revision_id, scope_revision_id, action, actor_id, occurred_at, citation_note
               FROM document_link_events WHERE document_id = ?
               ORDER BY target_type, target_id, scope_revision_id, occurred_at DESC, id DESC""",
            { rs, _ ->
                DocumentLinkEventDto(
                    rs.getObject("id", UUID::class.java), rs.getString("target_type"),
                    rs.getObject("target_id", UUID::class.java), rs.getObject("document_id", UUID::class.java),
                    rs.getObject("revision_id", UUID::class.java), rs.getObject("scope_revision_id", UUID::class.java),
                    rs.getString("action"), rs.getObject("actor_id", UUID::class.java),
                    rs.getTimestamp("occurred_at").toInstant().atOffset(ZoneOffset.UTC),
                    rs.getString("citation_note"),
                )
            },
            documentId,
        ).filter { it.action == "attach" }

    private fun document(rs: ResultSet): DocumentDto {
        val id = rs.getObject("id", UUID::class.java)
        return DocumentDto(
            id,
            rs.getInt("current_revision"),
            rs.getString("status"),
            rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            revision(rs, id),
            rs.getString("current_key"),
            tags(id),
        )
    }

    private fun revision(rs: ResultSet, documentId: UUID): DocumentRevisionDto {
        val revisionId = rs.getObject("revision_id", UUID::class.java)
        val attachments = files.attachments(revisionId)
        val primary = attachments.firstOrNull { it.primary }
        return DocumentRevisionDto(
            revisionId, documentId, rs.getInt("revision"),
            rs.getString("title"), rs.getString("description"), rs.getString("source_url"),
            primary?.fileName ?: rs.getString("file_name"), primary?.contentType ?: rs.getString("content_type"),
            rs.getTimestamp("revision_created_at").toInstant().atOffset(ZoneOffset.UTC),
            rs.getObject("created_by", UUID::class.java),
            rs.getString("citation_key"),
            mapper.readValue(rs.getString("bibliography"), BibliographyDto::class.java),
            attachments,
        )
    }

    fun tags(documentId: UUID): List<DocumentTagDto> = jdbc.query(
        "SELECT t.id, t.name FROM document_tags t JOIN document_tag_memberships m ON m.tag_id = t.id WHERE m.document_id = ? ORDER BY lower(t.name), t.id",
        { rs, _ -> DocumentTagDto(rs.getObject("id", UUID::class.java), rs.getString("name")) },
        documentId,
    )

    fun keyOwner(key: String): UUID? = jdbc.query(
        "SELECT document_id FROM document_keys WHERE normalized_key = lower(?)",
        { rs, _ -> rs.getObject(1, UUID::class.java) },
        key,
    ).firstOrNull()

    fun claimKey(documentId: UUID, key: String): Boolean {
        jdbc.update("INSERT INTO document_keys (normalized_key, key_value, document_id) VALUES (lower(?), ?, ?) ON CONFLICT DO NOTHING", key, key, documentId)
        return keyOwner(key) == documentId
    }

    fun updateMetadata(documentId: UUID, revisionId: UUID, key: String, bibliography: BibliographyDto) {
        jdbc.update("UPDATE documents SET citation_key = ? WHERE id = ?", key, documentId)
        jdbc.update("UPDATE document_revisions SET citation_key = ?, bibliography = ?::jsonb WHERE id = ?", key, mapper.writeValueAsString(bibliography), revisionId)
    }
}

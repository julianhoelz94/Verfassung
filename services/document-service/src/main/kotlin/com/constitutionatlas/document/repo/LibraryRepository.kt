package com.constitutionatlas.document.repo

import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.DocumentFolderDto
import com.constitutionatlas.document.api.DocumentPageDto
import com.constitutionatlas.document.api.DocumentTagDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class LibraryRepository(private val jdbc: JdbcTemplate, private val documents: DocumentRepository) {
    fun search(q: String?, folderId: UUID?, tagId: UUID?, status: String, offset: Int, limit: Int, sort: String): DocumentPageDto {
        val (where, args) = filters(q, folderId, tagId, status)
        val from = "FROM documents d JOIN document_revisions r ON r.document_id = d.id AND r.revision = d.current_revision $where"
        val total = jdbc.queryForObject("SELECT count(*) $from", Int::class.java, *args.toTypedArray()) ?: 0
        val order = when (sort) {
            "title" -> "lower(r.title), d.id"
            "key" -> "lower(d.citation_key), d.id"
            "year" -> "r.bibliography->>'issued' DESC NULLS LAST, lower(r.title), d.id"
            else -> "d.created_at DESC, d.id"
        }
        val ids = jdbc.query("SELECT d.id $from ORDER BY $order LIMIT ? OFFSET ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, *(args + listOf(limit, offset)).toTypedArray())
        return DocumentPageDto(ids.mapNotNull { documents.get(it) }, total, offset, limit)
    }

    fun all(folderId: UUID?): List<DocumentDto> {
        val (where, args) = filters(null, folderId, null, "active")
        return jdbc.query(
            "SELECT d.id FROM documents d JOIN document_revisions r ON r.document_id = d.id AND r.revision = d.current_revision $where ORDER BY lower(d.citation_key), d.id",
            { rs, _ -> rs.getObject(1, UUID::class.java) },
            *args.toTypedArray(),
        ).mapNotNull { documents.get(it) }
    }

    private fun filters(q: String?, folderId: UUID?, tagId: UUID?, status: String): Pair<String, MutableList<Any>> {
        val clauses = mutableListOf<String>()
        val args = mutableListOf<Any>()
        if (status != "all") {
            clauses += "d.status = ?"
            args += status
        }
        if (folderId != null) {
            clauses += "EXISTS (SELECT 1 FROM document_tag_memberships m JOIN document_folders f ON f.tag_id = m.tag_id WHERE m.document_id = d.id AND f.id = ?)"
            args += folderId
        }
        if (tagId != null) {
            clauses += "EXISTS (SELECT 1 FROM document_tag_memberships m WHERE m.document_id = d.id AND m.tag_id = ?)"
            args += tagId
        }
        val term = q?.trim().orEmpty()
        if (term.isNotEmpty()) {
            clauses += """(r.title ILIKE ? OR d.citation_key ILIKE ? OR r.bibliography::text ILIKE ?
                OR EXISTS (SELECT 1 FROM document_keys k WHERE k.document_id = d.id AND k.normalized_key = lower(?))
                OR EXISTS (SELECT 1 FROM document_tag_memberships m JOIN document_tags t ON t.id = m.tag_id WHERE m.document_id = d.id AND t.name ILIKE ?))"""
            args.addAll(listOf("%$term%", "%$term%", "%$term%", term, "%$term%"))
        }
        return (if (clauses.isEmpty()) "" else "WHERE " + clauses.joinToString(" AND ")) to args
    }

    fun folders(): List<DocumentFolderDto> = jdbc.query(
        "SELECT id, name, tag_id FROM document_folders ORDER BY lower(name), id",
        { rs, _ -> DocumentFolderDto(rs.getObject("id", UUID::class.java), rs.getString("name"), rs.getObject("tag_id", UUID::class.java)) },
    )

    fun folder(id: UUID): DocumentFolderDto? = jdbc.query(
        "SELECT id, name, tag_id FROM document_folders WHERE id = ?",
        { rs, _ -> DocumentFolderDto(rs.getObject("id", UUID::class.java), rs.getString("name"), rs.getObject("tag_id", UUID::class.java)) },
        id,
    ).firstOrNull()

    fun tags(): List<DocumentTagDto> = jdbc.query(
        "SELECT id, name FROM document_tags ORDER BY lower(name), id",
        { rs, _ -> DocumentTagDto(rs.getObject("id", UUID::class.java), rs.getString("name")) },
    )

    fun tag(id: UUID): DocumentTagDto? = jdbc.query(
        "SELECT id, name FROM document_tags WHERE id = ?",
        { rs, _ -> DocumentTagDto(rs.getObject("id", UUID::class.java), rs.getString("name")) },
        id,
    ).firstOrNull()

    fun createTag(name: String, actorId: UUID): DocumentTagDto {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO document_tags (id, name, created_by) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", id, name, actorId)
        return jdbc.query(
            "SELECT id, name FROM document_tags WHERE lower(name) = lower(?)",
            { rs, _ -> DocumentTagDto(rs.getObject("id", UUID::class.java), rs.getString("name")) },
            name,
        ).first()
    }

    fun renameTag(id: UUID, name: String): Boolean = jdbc.update("UPDATE document_tags SET name = ? WHERE id = ?", name, id) == 1

    fun createFolder(name: String, tagId: UUID, actorId: UUID): DocumentFolderDto {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO document_folders (id, name, tag_id, created_by) VALUES (?, ?, ?, ?)", id, name, tagId, actorId)
        return DocumentFolderDto(id, name, tagId)
    }

    fun renameFolder(id: UUID, name: String): Boolean = jdbc.update("UPDATE document_folders SET name = ? WHERE id = ?", name, id) == 1

    fun deleteFolder(id: UUID): Boolean = jdbc.update("DELETE FROM document_folders WHERE id = ?", id) == 1

    fun addTag(documentId: UUID, tagId: UUID, actorId: UUID): Boolean = jdbc.update(
        "INSERT INTO document_tag_memberships (document_id, tag_id, created_by) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
        documentId,
        tagId,
        actorId,
    ) == 1

    fun removeTag(documentId: UUID, tagId: UUID): Boolean = jdbc.update("DELETE FROM document_tag_memberships WHERE document_id = ? AND tag_id = ?", documentId, tagId) == 1
}

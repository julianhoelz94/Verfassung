package com.constitutionatlas.document.repo

import com.constitutionatlas.document.api.LegalPageRevisionDto
import com.constitutionatlas.document.api.LegalPageStateDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class LegalPageRepository(private val jdbc: JdbcTemplate) {
    fun history(key: String): List<LegalPageRevisionDto> = jdbc.query(
        "SELECT revision, content, created_at, created_by FROM legal_page_revisions WHERE page_key = ? ORDER BY revision DESC",
        { rs, _ -> LegalPageRevisionDto(rs.getInt("revision"), rs.getString("content"), rs.getObject("created_at", java.time.OffsetDateTime::class.java), rs.getObject("created_by", UUID::class.java)) },
        key,
    )

    fun state(key: String): LegalPageStateDto {
        val pointers = jdbc.query(
            "SELECT draft_revision, published_revision FROM legal_pages WHERE page_key = ?",
            { rs, _ -> rs.getInt("draft_revision") to rs.getObject("published_revision") as Int? },
            key,
        ).firstOrNull() ?: return LegalPageStateDto(key, null, null)
        return LegalPageStateDto(
            key,
            revision(key, pointers.first.takeIf { it > 0 }),
            revision(key, pointers.second),
        )
    }

    fun revision(key: String, number: Int?): LegalPageRevisionDto? {
        if (number == null) return null
        return jdbc.query(
            "SELECT revision, content, created_at, created_by FROM legal_page_revisions WHERE page_key = ? AND revision = ?",
            { rs, _ -> LegalPageRevisionDto(rs.getInt("revision"), rs.getString("content"), rs.getObject("created_at", java.time.OffsetDateTime::class.java), rs.getObject("created_by", UUID::class.java)) },
            key,
            number,
        ).firstOrNull()
    }

    fun ensure(key: String) {
        jdbc.update("INSERT INTO legal_pages(page_key) VALUES (?) ON CONFLICT DO NOTHING", key)
    }

    fun advanceDraft(key: String, expected: Int): Boolean =
        jdbc.update("UPDATE legal_pages SET draft_revision = draft_revision + 1 WHERE page_key = ? AND draft_revision = ?", key, expected) == 1

    fun insertRevision(key: String, number: Int, content: String, actorId: UUID) {
        jdbc.update("INSERT INTO legal_page_revisions(page_key, revision, content, created_by) VALUES (?, ?, ?, ?)", key, number, content, actorId)
    }

    fun publish(key: String, expected: Int): Boolean =
        jdbc.update("UPDATE legal_pages SET published_revision = draft_revision WHERE page_key = ? AND draft_revision = ? AND draft_revision > 0", key, expected) == 1

    fun event(key: String, number: Int, type: String, actorId: UUID) {
        jdbc.update("INSERT INTO legal_page_events(id, page_key, revision, event_type, actor_id) VALUES (?, ?, ?, ?, ?)", UUID.randomUUID(), key, number, type, actorId)
    }
}

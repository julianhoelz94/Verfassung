package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.WikiImage
import com.constitutionatlas.catalog.api.WikiPageRevision
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class WikiRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun targetExists(targetType: String, targetId: UUID): Boolean {
        val table = if (targetType == "country") "countries" else "constitutions"
        return (jdbc.queryForObject("SELECT COUNT(*) FROM $table WHERE id = ?", Int::class.java, targetId) ?: 0) > 0
    }

    fun pageId(targetType: String, targetId: UUID): UUID? =
        jdbc.query(
            "SELECT id FROM wiki_pages WHERE target_type = ? AND target_id = ?",
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            targetType,
            targetId,
        ).firstOrNull()

    fun ensurePage(targetType: String, targetId: UUID): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO wiki_pages (id, target_type, target_id) VALUES (?, ?, ?) ON CONFLICT (target_type, target_id) DO NOTHING",
            id,
            targetType,
            targetId,
        )
        return pageId(targetType, targetId)!!
    }

    fun lockPage(pageId: UUID) {
        jdbc.query("SELECT id FROM wiki_pages WHERE id = ? FOR UPDATE", { rs, _ -> rs.getObject("id", UUID::class.java) }, pageId)
    }

    fun published(targetType: String, targetId: UUID): WikiPageRevision? =
        jdbc.query(
            """
            SELECT r.id, p.target_type, p.target_id, r.predecessor_id, r.summary, r.body, r.images, r.source_urls
            FROM wiki_pages p
            JOIN wiki_page_revisions r ON r.id = p.published_revision_id
            WHERE p.target_type = ? AND p.target_id = ?
            """.trimIndent(),
            rowMapper,
            targetType,
            targetId,
        ).firstOrNull()

    fun latest(targetType: String, targetId: UUID): WikiPageRevision? =
        jdbc.query(
            """
            SELECT r.id, p.target_type, p.target_id, r.predecessor_id, r.summary, r.body, r.images, r.source_urls
            FROM wiki_pages p
            JOIN wiki_page_revisions r ON r.page_id = p.id
            WHERE p.target_type = ? AND p.target_id = ?
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
            """.trimIndent(),
            rowMapper,
            targetType,
            targetId,
        ).firstOrNull()

    fun revision(targetType: String, targetId: UUID, revisionId: UUID): WikiPageRevision? =
        jdbc.query(
            """
            SELECT r.id, p.target_type, p.target_id, r.predecessor_id, r.summary, r.body, r.images, r.source_urls
            FROM wiki_pages p
            JOIN wiki_page_revisions r ON r.page_id = p.id
            WHERE p.target_type = ? AND p.target_id = ? AND r.id = ?
            """.trimIndent(),
            rowMapper,
            targetType,
            targetId,
            revisionId,
        ).firstOrNull()

    fun append(pageId: UUID, predecessorId: UUID?, summary: String, body: String, images: List<WikiImage>, sourceUrls: List<String>, actorId: UUID): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO wiki_page_revisions (id, page_id, predecessor_id, summary, body, images, source_urls, created_by) VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)",
            id,
            pageId,
            predecessorId,
            summary,
            body,
            mapper.writeValueAsString(images),
            mapper.writeValueAsString(sourceUrls),
            actorId,
        )
        return id
    }

    fun publish(pageId: UUID, revisionId: UUID) {
        jdbc.update("UPDATE wiki_pages SET published_revision_id = ? WHERE id = ?", revisionId, pageId)
    }

    private val rowMapper = org.springframework.jdbc.core.RowMapper<WikiPageRevision> { rs, _ ->
        WikiPageRevision(
            rs.getObject("id", UUID::class.java),
            rs.getString("target_type"),
            rs.getObject("target_id", UUID::class.java),
            rs.getObject("predecessor_id", UUID::class.java),
            rs.getString("summary"),
            rs.getString("body"),
            mapper.readValue(rs.getString("images"), object : TypeReference<List<WikiImage>>() {}),
            mapper.readValue(rs.getString("source_urls"), object : TypeReference<List<String>>() {}),
        )
    }
}

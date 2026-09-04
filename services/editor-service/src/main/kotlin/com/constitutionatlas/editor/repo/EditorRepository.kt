package com.constitutionatlas.editor.repo

import com.constitutionatlas.editor.api.DraftArticleDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class EditorRepository(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun insertSession(actorId: UUID, versionId: UUID): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO edit_sessions (id, actor_id, version_id, status) VALUES (?, ?, ?, 'open')",
            id,
            actorId,
            versionId,
        )
        return id
    }

    fun findSession(sessionId: UUID): EditSessionDto? {
        val row = jdbc.query(
            """
            SELECT id, actor_id, version_id, status
            FROM edit_sessions
            WHERE id = ?
            """.trimIndent(),
            { rs, _ ->
                Triple(
                    rs.getObject("id", UUID::class.java),
                    rs.getObject("actor_id", UUID::class.java),
                    Triple(
                        rs.getObject("version_id", UUID::class.java),
                        rs.getString("status"),
                        0,
                    ),
                )
            },
            sessionId,
        ).firstOrNull() ?: return null
        val revisionCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM edit_revisions WHERE session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0
        return EditSessionDto(row.first, row.second, row.third.first, row.third.second, revisionCount)
    }

    fun insertChange(sessionId: UUID, articleId: UUID?, changeKind: String, payload: Any) {
        jdbc.update(
            """
            INSERT INTO draft_changes (id, session_id, article_id, change_kind, payload)
            VALUES (?, ?, ?, ?, ?::jsonb)
            """.trimIndent(),
            UUID.randomUUID(),
            sessionId,
            articleId,
            changeKind,
            objectMapper.writeValueAsString(payload),
        )
        jdbc.update("UPDATE edit_sessions SET updated_at = NOW() WHERE id = ?", sessionId)
    }

    fun nextRevisionSequence(sessionId: UUID): Int {
        val max = jdbc.queryForObject(
            "SELECT COALESCE(MAX(sequence), 0) FROM edit_revisions WHERE session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0
        return max + 1
    }

    fun insertRevision(sessionId: UUID, sequence: Int, snapshot: Any) {
        jdbc.update(
            """
            INSERT INTO edit_revisions (id, session_id, sequence, snapshot)
            VALUES (?, ?, ?, ?::jsonb)
            """.trimIndent(),
            UUID.randomUUID(),
            sessionId,
            sequence,
            objectMapper.writeValueAsString(snapshot),
        )
    }

    fun findOpenSession(actorId: UUID, versionId: UUID): UUID? =
        jdbc.query(
            """
            SELECT id FROM edit_sessions
            WHERE actor_id = ? AND version_id = ? AND status IN ('open', 'reviewing', 'approved')
            ORDER BY updated_at DESC
            LIMIT 1
            """.trimIndent(),
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            actorId,
            versionId,
        ).firstOrNull()

    fun updateStatus(sessionId: UUID, status: String) {
        jdbc.update(
            "UPDATE edit_sessions SET status = ?, updated_at = NOW() WHERE id = ?",
            status,
            sessionId,
        )
    }

    fun latestSnapshot(sessionId: UUID): String? =
        jdbc.query(
            """
            SELECT snapshot::text
            FROM edit_revisions
            WHERE session_id = ?
            ORDER BY sequence DESC
            LIMIT 1
            """.trimIndent(),
            { rs, _ -> rs.getString(1) },
            sessionId,
        ).firstOrNull()

    fun listLatestDrafts(sessionId: UUID): List<DraftArticleDto> =
        jdbc.query(
            """
            SELECT DISTINCT ON (article_id) article_id, payload
            FROM draft_changes
            WHERE session_id = ? AND change_kind = 'save' AND article_id IS NOT NULL
            ORDER BY article_id, created_at DESC
            """.trimIndent(),
            { rs, _ ->
                val articleId = rs.getObject("article_id", UUID::class.java)
                val node = objectMapper.readTree(rs.getString("payload"))
                DraftArticleDto(
                    articleId = articleId,
                    title = node.path("title").asText(""),
                    body = node.path("body").asText(""),
                )
            },
            sessionId,
        )
}

package com.constitutionatlas.editor.repo

import com.constitutionatlas.editor.api.DraftArticleDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.EditSessionStatus
import com.constitutionatlas.editor.api.EditSessionSummaryDto
import com.constitutionatlas.editor.api.SearchIndexStatus
import com.constitutionatlas.editor.service.DomainEvents
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@Repository
class EditorRepository(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun insertSession(actorId: UUID, versionId: UUID): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO edit_sessions (id, actor_id, version_id, status) VALUES (?, ?, ?, ?)",
            id,
            actorId,
            versionId,
            EditSessionStatus.OPEN.toJson(),
        )
        return id
    }

    fun findSession(sessionId: UUID): EditSessionDto? {
        val session = jdbc.query(
            """
            SELECT id, actor_id, version_id, status
            FROM edit_sessions
            WHERE id = ?
            """.trimIndent(),
            { rs, _ ->
                EditSessionDto(
                    id = rs.getObject("id", UUID::class.java),
                    actorId = rs.getObject("actor_id", UUID::class.java),
                    versionId = rs.getObject("version_id", UUID::class.java),
                    status = EditSessionStatus.fromDb(rs.getString("status")),
                    revisionCount = 0,
                )
            },
            sessionId,
        ).firstOrNull() ?: return null
        val revisionCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM edit_revisions WHERE session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0
        return session.copy(revisionCount = revisionCount)
    }

    fun listSessions(status: EditSessionStatus?, openedBy: UUID?, versionId: UUID?): List<EditSessionSummaryDto> {
        val sql = StringBuilder(
            """
            SELECT s.id, s.actor_id, s.version_id, s.status, s.created_at, s.updated_at,
              (
                SELECT COUNT(DISTINCT c.article_id)
                FROM draft_changes c
                WHERE c.session_id = s.id AND c.article_id IS NOT NULL
              ) AS changed_article_count
            FROM edit_sessions s
            WHERE 1 = 1
            """.trimIndent(),
        )
        val args = mutableListOf<Any>()
        if (status != null) {
            sql.append(" AND s.status = ?")
            args.add(status.toJson())
        }
        if (openedBy != null) {
            sql.append(" AND s.actor_id = ?")
            args.add(openedBy)
        }
        if (versionId != null) {
            sql.append(" AND s.version_id = ?")
            args.add(versionId)
        }
        sql.append(" ORDER BY s.updated_at DESC LIMIT 100")
        return jdbc.query(sql.toString(), { rs, _ ->
            EditSessionSummaryDto(
                id = rs.getObject("id", UUID::class.java),
                versionId = rs.getObject("version_id", UUID::class.java),
                status = EditSessionStatus.fromDb(rs.getString("status")),
                openedBy = rs.getObject("actor_id", UUID::class.java),
                openedAt = toInstant(rs.getTimestamp("created_at")),
                updatedAt = toInstant(rs.getTimestamp("updated_at")),
                changedArticleCount = rs.getInt("changed_article_count"),
            )
        }, *args.toTypedArray())
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

    fun findOpenSession(actorId: UUID, versionId: UUID): UUID? {
        val statuses = EditSessionStatus.inProgress
        val placeholders = statuses.joinToString(",") { "?" }
        return jdbc.query(
            """
            SELECT id FROM edit_sessions
            WHERE actor_id = ? AND version_id = ? AND status IN ($placeholders)
            ORDER BY updated_at DESC
            LIMIT 1
            """.trimIndent(),
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            *listOf(actorId, versionId).plus(statuses.map { it.toJson() }).toTypedArray(),
        ).firstOrNull()
    }

    fun updateStatus(sessionId: UUID, status: EditSessionStatus) {
        jdbc.update(
            "UPDATE edit_sessions SET status = ?, updated_at = NOW() WHERE id = ?",
            status.toJson(),
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

    fun insertOutboxEvent(
        sessionId: UUID,
        eventName: String,
        payload: Map<String, Any?>,
        publishedAt: Instant? = null,
    ) {
        jdbc.update(
            """
            INSERT INTO outbox_events (id, session_id, event_name, payload, published_at)
            VALUES (?, ?, ?, ?::jsonb, ?)
            """.trimIndent(),
            UUID.randomUUID(),
            sessionId,
            eventName,
            objectMapper.writeValueAsString(payload),
            publishedAt?.let { Timestamp.from(it) },
        )
    }

    fun findPublishedPreview(sessionId: UUID): PublishedPreview? =
        jdbc.query(
            """
            SELECT payload
            FROM outbox_events
            WHERE session_id = ? AND event_name = ?
            ORDER BY created_at DESC
            LIMIT 1
            """.trimIndent(),
            { rs, _ ->
                val node = objectMapper.readTree(rs.getString("payload"))
                val source = node.path("sourceVersionId").asText("")
                val next = node.path("newVersionId").asText("")
                if (source.isBlank() || next.isBlank()) {
                    null
                } else {
                    val labelNode = node.get("versionLabel")
                    PublishedPreview(
                        sourceVersionId = UUID.fromString(source),
                        newVersionId = UUID.fromString(next),
                        versionLabel = if (labelNode == null || labelNode.isNull) null else labelNode.asText(),
                    )
                }
            },
            sessionId,
            DomainEvents.VERSION_PUBLISHED,
        ).firstOrNull()

    fun searchIndexStatus(sessionId: UUID): SearchIndexStatus? {
        val row = jdbc.query(
            """
            SELECT published_at, last_error
            FROM outbox_events
            WHERE session_id = ? AND event_name = ?
            ORDER BY created_at DESC
            LIMIT 1
            """.trimIndent(),
            { rs, _ ->
                Pair(rs.getTimestamp("published_at"), rs.getString("last_error"))
            },
            sessionId,
            DomainEvents.SEARCH_REINDEX_REQUESTED,
        ).firstOrNull() ?: return null
        if (row.first != null) {
            return SearchIndexStatus.READY
        }
        if (!row.second.isNullOrBlank()) {
            return SearchIndexStatus.FAILED
        }
        return SearchIndexStatus.PENDING
    }

    fun claimUnpublishedSearchReindex(limit: Int): List<UUID> =
        jdbc.query(
            """
            SELECT id
            FROM outbox_events
            WHERE event_name = ? AND published_at IS NULL
            ORDER BY created_at
            LIMIT ?
            FOR UPDATE SKIP LOCKED
            """.trimIndent(),
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            DomainEvents.SEARCH_REINDEX_REQUESTED,
            limit,
        )

    fun markOutboxPublished(id: UUID) {
        jdbc.update(
            """
            UPDATE outbox_events
            SET published_at = NOW(), last_error = NULL
            WHERE id = ?
            """.trimIndent(),
            id,
        )
    }

    fun markOutboxFailed(id: UUID, error: String) {
        jdbc.update(
            """
            UPDATE outbox_events
            SET last_error = ?, attempt_count = attempt_count + 1
            WHERE id = ?
            """.trimIndent(),
            error.take(2000),
            id,
        )
    }
}

data class PublishedPreview(
    val sourceVersionId: UUID,
    val newVersionId: UUID,
    val versionLabel: String?,
)

private fun toInstant(value: Timestamp?): Instant = value?.toInstant() ?: Instant.EPOCH

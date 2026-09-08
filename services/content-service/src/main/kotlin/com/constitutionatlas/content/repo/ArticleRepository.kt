package com.constitutionatlas.content.repo

import com.constitutionatlas.content.api.ArticleDetail
import com.constitutionatlas.content.api.ArticleSummary
import com.constitutionatlas.content.api.ContentNodeDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.util.UUID

data class ContentNodeInsert(
    val id: UUID,
    val versionId: UUID,
    val kind: String,
    val parentId: UUID?,
    val label: String?,
    val number: String?,
    val title: String?,
    val body: String?,
    val sortOrder: Int,
    val predecessorId: UUID? = null,
)

data class ContentNodeRecord(
    val id: UUID,
    val kind: String,
    val parentId: UUID?,
    val body: String?,
    val sortOrder: Int,
)

@Repository
class ArticleRepository(private val jdbc: JdbcTemplate) {
    fun listByVersion(
        versionId: UUID,
        offset: Int = 0,
        limit: Int? = null,
        includeBody: Boolean = false,
    ): List<ArticleSummary> {
        val columns =
            if (includeBody) {
                "id, version_id, COALESCE(number, label, '') AS article_number, title, sort_order, body, predecessor_id"
            } else {
                "id, version_id, COALESCE(number, label, '') AS article_number, title, sort_order, predecessor_id"
            }
        val sql = StringBuilder(
            """
            SELECT $columns
            FROM content_nodes
            WHERE version_id = ?
              AND parent_id IS NULL
            ORDER BY sort_order, COALESCE(number, label, '')
            """.trimIndent(),
        )
        val mapper = if (includeBody) summaryWithBodyMapper else summaryMapper
        if (limit != null) {
            sql.append(" LIMIT ? OFFSET ?")
            return jdbc.query(sql.toString(), mapper, versionId, limit, offset)
        }
        return jdbc.query(sql.toString(), mapper, versionId)
    }

    fun countByVersion(versionId: UUID): Int =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM content_nodes WHERE version_id = ? AND parent_id IS NULL",
            Int::class.java,
            versionId,
        ) ?: 0

    fun findById(id: UUID): ArticleDetail? =
        jdbc.query(
            """
            SELECT id, version_id, COALESCE(number, label, '') AS article_number, title,
                   COALESCE(body, '') AS body, sort_order, predecessor_id
            FROM content_nodes
            WHERE id = ?
              AND parent_id IS NULL
            """.trimIndent(),
            detailMapper,
            id,
        ).firstOrNull()

    fun versionIdOfNode(id: UUID): UUID? =
        jdbc.query(
            "SELECT version_id FROM content_nodes WHERE id = ?",
            { rs, _ -> rs.getObject("version_id", UUID::class.java) },
            id,
        ).firstOrNull()

    fun deleteForVersion(versionId: UUID) {
        jdbc.update("DELETE FROM content_nodes WHERE version_id = ? AND parent_id IS NULL", versionId)
    }

    fun insertNode(node: ContentNodeInsert) {
        jdbc.update(
            """
            INSERT INTO content_nodes
              (id, version_id, kind, parent_id, label, number, title, body, sort_order, predecessor_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            node.id,
            node.versionId,
            node.kind,
            node.parentId,
            node.label,
            node.number,
            node.title,
            node.body,
            node.sortOrder,
            node.predecessorId,
        )
    }

    fun deleteChildren(parentId: UUID) {
        jdbc.update("DELETE FROM content_nodes WHERE parent_id = ?", parentId)
    }

    fun updateRoot(id: UUID, title: String, body: String?): Boolean {
        val updated =
            if (body == null) {
                jdbc.update(
                    "UPDATE content_nodes SET title = ? WHERE id = ? AND parent_id IS NULL",
                    title,
                    id,
                )
            } else {
                jdbc.update(
                    "UPDATE content_nodes SET title = ?, body = ? WHERE id = ? AND parent_id IS NULL",
                    title,
                    body,
                    id,
                )
            }
        return updated > 0
    }

    fun updateNodeTitle(id: UUID, title: String?): Boolean =
        jdbc.update("UPDATE content_nodes SET title = ? WHERE id = ?", title, id) > 0

    fun parentIdOf(id: UUID): UUID? {
        val found = jdbc.query(
            "SELECT parent_id FROM content_nodes WHERE id = ?",
            { rs, _ -> rs.getObject("parent_id", UUID::class.java) },
            id,
        )
        if (found.isEmpty()) {
            return null
        }
        return found.first()
    }

    fun nodeExists(id: UUID): Boolean =
        (
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM content_nodes WHERE id = ?",
                Int::class.java,
                id,
            ) ?: 0
            ) > 0

    fun listChildren(parentId: UUID): List<ContentNodeDto> {
        val rows = jdbc.query(
            """
            SELECT id, kind, label, number, title, body, sort_order, predecessor_id
            FROM content_nodes
            WHERE parent_id = ?
            ORDER BY sort_order, COALESCE(number, label, '')
            """.trimIndent(),
            nodeRowMapper,
            parentId,
        )
        return rows.map(::toDto)
    }

    fun findNode(id: UUID): ContentNodeDto? {
        val row = jdbc.query(
            """
            SELECT id, kind, label, number, title, body, sort_order, predecessor_id
            FROM content_nodes
            WHERE id = ?
            """.trimIndent(),
            nodeRowMapper,
            id,
        ).firstOrNull() ?: return null
        return toDto(row)
    }

    fun listNodesOutsideKinds(versionId: UUID, keepKinds: List<String>): List<ContentNodeRecord> =
        jdbc.query(
            """
            SELECT id, kind, parent_id, body, sort_order
            FROM content_nodes
            WHERE version_id = ?
              AND kind NOT IN (${keepKinds.joinToString(",") { "?" }})
            """.trimIndent(),
            { rs, _ ->
                ContentNodeRecord(
                    id = rs.getObject("id", UUID::class.java),
                    kind = rs.getString("kind"),
                    parentId = rs.getObject("parent_id", UUID::class.java),
                    body = rs.getString("body"),
                    sortOrder = rs.getInt("sort_order"),
                )
            },
            *listOf(versionId).plus(keepKinds).toTypedArray(),
        )

    fun parentMap(versionId: UUID): Map<UUID, UUID?> =
        jdbc.query(
            "SELECT id, parent_id FROM content_nodes WHERE version_id = ?",
            { rs, _ ->
                rs.getObject("id", UUID::class.java) to rs.getObject("parent_id", UUID::class.java)
            },
            versionId,
        ).toMap()

    fun updateKind(id: UUID, kind: String) {
        jdbc.update("UPDATE content_nodes SET kind = ? WHERE id = ?", kind, id)
    }

    fun bodyOf(id: UUID): String? =
        jdbc.query(
            "SELECT body FROM content_nodes WHERE id = ?",
            { rs, _ -> rs.getString("body") },
            id,
        ).firstOrNull()

    fun updateBody(id: UUID, body: String) {
        jdbc.update("UPDATE content_nodes SET body = ? WHERE id = ?", body, id)
    }

    fun listChildOrders(parentId: UUID): List<Pair<UUID, Int>> =
        jdbc.query(
            "SELECT id, sort_order FROM content_nodes WHERE parent_id = ? ORDER BY sort_order",
            { rs, _ -> rs.getObject("id", UUID::class.java) to rs.getInt("sort_order") },
            parentId,
        )

    fun reparent(id: UUID, parentId: UUID, sortOrder: Int) {
        jdbc.update(
            "UPDATE content_nodes SET parent_id = ?, sort_order = ? WHERE id = ?",
            parentId,
            sortOrder,
            id,
        )
    }

    fun deleteNode(id: UUID) {
        jdbc.update("DELETE FROM content_nodes WHERE id = ?", id)
    }

    private data class ContentNodeRow(
        val id: UUID,
        val kind: String,
        val label: String?,
        val number: String?,
        val title: String?,
        val body: String?,
        val sortOrder: Int,
        val predecessorId: UUID?,
    )

    private val summaryMapper = RowMapper { rs, _ ->
        ArticleSummary(
            id = rs.getObject("id", UUID::class.java),
            versionId = rs.getObject("version_id", UUID::class.java),
            articleNumber = rs.getString("article_number"),
            title = rs.getString("title"),
            sortOrder = rs.getInt("sort_order"),
            predecessorId = rs.getObject("predecessor_id", UUID::class.java),
        )
    }

    private val summaryWithBodyMapper = RowMapper { rs, _ ->
        ArticleSummary(
            id = rs.getObject("id", UUID::class.java),
            versionId = rs.getObject("version_id", UUID::class.java),
            articleNumber = rs.getString("article_number"),
            title = rs.getString("title"),
            sortOrder = rs.getInt("sort_order"),
            body = rs.getString("body"),
            predecessorId = rs.getObject("predecessor_id", UUID::class.java),
        )
    }

    private val detailMapper = RowMapper { rs, _ ->
        ArticleDetail(
            id = rs.getObject("id", UUID::class.java),
            versionId = rs.getObject("version_id", UUID::class.java),
            articleNumber = rs.getString("article_number"),
            title = rs.getString("title"),
            body = rs.getString("body"),
            sortOrder = rs.getInt("sort_order"),
            predecessorId = rs.getObject("predecessor_id", UUID::class.java),
        )
    }

    private fun toDto(row: ContentNodeRow): ContentNodeDto =
        ContentNodeDto(
            id = row.id,
            kind = row.kind,
            label = row.label,
            number = row.number,
            title = row.title,
            body = row.body,
            sortOrder = row.sortOrder,
            children = listChildren(row.id),
            predecessorId = row.predecessorId,
        )

    private val nodeRowMapper = RowMapper { rs, _ ->
        ContentNodeRow(
            id = rs.getObject("id", UUID::class.java),
            kind = rs.getString("kind"),
            label = rs.getString("label"),
            number = rs.getString("number"),
            title = rs.getString("title"),
            body = rs.getString("body"),
            sortOrder = rs.getInt("sort_order"),
            predecessorId = rs.getObject("predecessor_id", UUID::class.java),
        )
    }
}

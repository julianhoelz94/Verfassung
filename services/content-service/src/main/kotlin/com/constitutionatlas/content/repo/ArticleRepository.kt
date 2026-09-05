package com.constitutionatlas.content.repo

import com.constitutionatlas.content.api.ArticleDetail
import com.constitutionatlas.content.api.ArticleSummary
import com.constitutionatlas.content.api.ArticleWrite
import com.constitutionatlas.content.api.ContentNodeDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.util.UUID

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
                "id, version_id, COALESCE(number, label, '') AS article_number, title, sort_order, body"
            } else {
                "id, version_id, COALESCE(number, label, '') AS article_number, title, sort_order"
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
            SELECT id, version_id, COALESCE(number, label, '') AS article_number, title, COALESCE(body, '') AS body, sort_order
            FROM content_nodes
            WHERE id = ?
              AND parent_id IS NULL
            """.trimIndent(),
            detailMapper,
            id,
        ).firstOrNull()

    fun replaceForVersion(versionId: UUID, articles: List<ArticleWrite>): List<ArticleSummary> {
        jdbc.update("DELETE FROM content_nodes WHERE version_id = ? AND parent_id IS NULL", versionId)
        jdbc.update("DELETE FROM articles WHERE version_id = ?", versionId)
        articles.forEach { article ->
            val id = UUID.randomUUID()
            jdbc.update(
                """
                INSERT INTO articles (id, version_id, article_number, title, body, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                id,
                versionId,
                article.articleNumber,
                article.title,
                article.body,
                article.sortOrder,
            )
            jdbc.update(
                """
                INSERT INTO content_nodes (id, version_id, kind, parent_id, label, number, title, body, sort_order)
                VALUES (?, ?, 'article', NULL, ?, ?, ?, ?, ?)
                """.trimIndent(),
                id,
                versionId,
                article.articleNumber,
                article.articleNumber,
                article.title,
                article.body,
                article.sortOrder,
            )
        }
        return listByVersion(versionId)
    }

    fun updateText(id: UUID, title: String, body: String, replaceChildren: Boolean): ArticleDetail? {
        if (findById(id) == null) {
            return null
        }
        if (replaceChildren) {
            jdbc.update("DELETE FROM content_nodes WHERE parent_id = ?", id)
        }
        val nodeUpdated =
            if (replaceChildren) {
                jdbc.update(
                    "UPDATE content_nodes SET title = ?, body = ? WHERE id = ? AND parent_id IS NULL",
                    title,
                    body,
                    id,
                )
            } else {
                jdbc.update(
                    "UPDATE content_nodes SET title = ? WHERE id = ? AND parent_id IS NULL",
                    title,
                    id,
                )
            }
        if (nodeUpdated == 0) {
            return null
        }
        val projectedBody = if (replaceChildren) body else projectedBody(id)
        jdbc.update(
            "UPDATE articles SET title = ?, body = ? WHERE id = ?",
            title,
            projectedBody,
            id,
        )
        return findById(id)
    }

    fun listChildren(parentId: UUID): List<ContentNodeDto> {
        val rows = jdbc.query(
            """
            SELECT id, kind, label, number, title, body, sort_order
            FROM content_nodes
            WHERE parent_id = ?
            ORDER BY sort_order, COALESCE(number, label, '')
            """.trimIndent(),
            { rs, _ ->
                ContentNodeRow(
                    id = rs.getObject("id", UUID::class.java),
                    kind = rs.getString("kind"),
                    label = rs.getString("label"),
                    number = rs.getString("number"),
                    title = rs.getString("title"),
                    body = rs.getString("body"),
                    sortOrder = rs.getInt("sort_order"),
                )
            },
            parentId,
        )
        return rows.map { row ->
            ContentNodeDto(
                id = row.id,
                kind = row.kind,
                label = row.label,
                number = row.number,
                title = row.title,
                body = row.body,
                sortOrder = row.sortOrder,
                children = listChildren(row.id),
            )
        }
    }

    fun findNode(id: UUID): ContentNodeDto? {
        val row = jdbc.query(
            """
            SELECT id, kind, label, number, title, body, sort_order
            FROM content_nodes
            WHERE id = ?
            """.trimIndent(),
            { rs, _ ->
                ContentNodeRow(
                    id = rs.getObject("id", UUID::class.java),
                    kind = rs.getString("kind"),
                    label = rs.getString("label"),
                    number = rs.getString("number"),
                    title = rs.getString("title"),
                    body = rs.getString("body"),
                    sortOrder = rs.getInt("sort_order"),
                )
            },
            id,
        ).firstOrNull() ?: return null
        return ContentNodeDto(
            id = row.id,
            kind = row.kind,
            label = row.label,
            number = row.number,
            title = row.title,
            body = row.body,
            sortOrder = row.sortOrder,
            children = listChildren(row.id),
        )
    }

    fun updateNodeTitle(id: UUID, title: String?): ContentNodeDto? {
        val found = jdbc.query(
            "SELECT parent_id FROM content_nodes WHERE id = ?",
            { rs, _ -> rs.getObject("parent_id", UUID::class.java) },
            id,
        )
        if (found.isEmpty()) {
            return null
        }
        val parentId = found.first()
        val stored = title?.trim()?.takeIf { it.isNotEmpty() }
        if (parentId == null) {
            val required = stored ?: throw IllegalArgumentException("title must not be blank")
            jdbc.update("UPDATE content_nodes SET title = ? WHERE id = ?", required, id)
            jdbc.update("UPDATE articles SET title = ? WHERE id = ?", required, id)
        } else {
            jdbc.update("UPDATE content_nodes SET title = ? WHERE id = ?", stored, id)
        }
        return findNode(id)
    }

    fun projectedBody(id: UUID): String {
        val children = listChildren(id)
        if (children.isNotEmpty()) {
            return flattenText(children)
        }
        return findById(id)?.body.orEmpty()
    }

    fun restructureKeepingKinds(versionId: UUID, keepKinds: List<String>): Int {
        var absorbed = 0
        while (true) {
            val removed = jdbc.query(
                """
                SELECT id, kind, parent_id, body, sort_order
                FROM content_nodes
                WHERE version_id = ?
                  AND kind NOT IN (${keepKinds.joinToString(",") { "?" }})
                """.trimIndent(),
                { rs, _ ->
                    NodeRow(
                        id = rs.getObject("id", UUID::class.java),
                        kind = rs.getString("kind"),
                        parentId = rs.getObject("parent_id", UUID::class.java),
                        body = rs.getString("body"),
                        sortOrder = rs.getInt("sort_order"),
                    )
                },
                *listOf(versionId).plus(keepKinds).toTypedArray(),
            )
            if (removed.isEmpty()) {
                break
            }
            val depths = nodeDepths(versionId)
            absorb(nextVictim(removed, depths), keepKinds.first())
            absorbed += 1
        }
        listByVersion(versionId).forEach { root ->
            jdbc.update("UPDATE articles SET body = ? WHERE id = ?", projectedBody(root.id), root.id)
        }
        return absorbed
    }

    private fun nextVictim(removed: List<NodeRow>, depths: Map<UUID, Int>): NodeRow {
        val maxDepth = removed.maxOf { depths[it.id] ?: 0 }
        return removed
            .filter { (depths[it.id] ?: 0) == maxDepth }
            .sortedWith(compareBy<NodeRow> { it.sortOrder }.thenBy { it.id.toString() })
            .first()
    }

    private fun nodeDepths(versionId: UUID): Map<UUID, Int> {
        val parents = jdbc.query(
            "SELECT id, parent_id FROM content_nodes WHERE version_id = ?",
            { rs, _ ->
                rs.getObject("id", UUID::class.java) to rs.getObject("parent_id", UUID::class.java)
            },
            versionId,
        ).toMap()
        val memo = mutableMapOf<UUID, Int>()
        fun depth(id: UUID): Int {
            memo[id]?.let { return it }
            val parent = parents[id] ?: return 0.also { memo[id] = 0 }
            val value = depth(parent) + 1
            memo[id] = value
            return value
        }
        parents.keys.forEach { depth(it) }
        return memo
    }

    private fun absorb(node: NodeRow, fallbackRootKind: String) {
        val parentId = node.parentId
        if (parentId == null) {
            jdbc.update("UPDATE content_nodes SET kind = ? WHERE id = ?", fallbackRootKind, node.id)
            return
        }
        val extra = node.body?.trim().orEmpty()
        if (extra.isNotEmpty()) {
            val parentBody =
                jdbc.query(
                    "SELECT body FROM content_nodes WHERE id = ?",
                    { rs, _ -> rs.getString("body") },
                    parentId,
                ).firstOrNull()
            val joined = listOf(parentBody?.trim().orEmpty(), extra).filter { it.isNotEmpty() }.joinToString(" ")
            jdbc.update("UPDATE content_nodes SET body = ? WHERE id = ?", joined, parentId)
        }
        val children = jdbc.query(
            "SELECT id, sort_order FROM content_nodes WHERE parent_id = ? ORDER BY sort_order",
            { rs, _ -> rs.getObject("id", UUID::class.java) to rs.getInt("sort_order") },
            node.id,
        )
        children.forEach { (childId, childOrder) ->
            jdbc.update(
                "UPDATE content_nodes SET parent_id = ?, sort_order = ? WHERE id = ?",
                parentId,
                node.sortOrder * 1_000 + childOrder,
                childId,
            )
        }
        jdbc.update("DELETE FROM content_nodes WHERE id = ?", node.id)
    }

    private data class NodeRow(
        val id: UUID,
        val kind: String,
        val parentId: UUID?,
        val body: String?,
        val sortOrder: Int,
    )

    private data class ContentNodeRow(
        val id: UUID,
        val kind: String,
        val label: String?,
        val number: String?,
        val title: String?,
        val body: String?,
        val sortOrder: Int,
    )

    private val summaryMapper = RowMapper { rs, _ ->
        ArticleSummary(
            id = rs.getObject("id", UUID::class.java),
            versionId = rs.getObject("version_id", UUID::class.java),
            articleNumber = rs.getString("article_number"),
            title = rs.getString("title"),
            sortOrder = rs.getInt("sort_order"),
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
        )
    }

    companion object {
        fun flattenText(nodes: List<ContentNodeDto>): String =
            nodes.flatMap { collectText(it) }.joinToString(" ")

        private fun collectText(node: ContentNodeDto): List<String> {
            val parts = mutableListOf<String>()
            node.body?.trim()?.takeIf { it.isNotEmpty() }?.let { parts.add(it) }
            node.children.forEach { parts.addAll(collectText(it)) }
            return parts
        }
    }
}

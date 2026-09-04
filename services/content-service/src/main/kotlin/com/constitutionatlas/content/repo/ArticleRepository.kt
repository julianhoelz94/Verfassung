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
                "id, version_id, article_number, title, sort_order, body"
            } else {
                "id, version_id, article_number, title, sort_order"
            }
        val sql = StringBuilder(
            """
            SELECT $columns
            FROM articles
            WHERE version_id = ?
            ORDER BY sort_order, article_number
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
            "SELECT COUNT(*) FROM articles WHERE version_id = ?",
            Int::class.java,
            versionId,
        ) ?: 0

    fun findById(id: UUID): ArticleDetail? =
        jdbc.query(
            """
            SELECT id, version_id, article_number, title, body, sort_order
            FROM articles
            WHERE id = ?
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

    fun updateText(id: UUID, title: String, body: String): ArticleDetail? {
        val updated = jdbc.update(
            "UPDATE articles SET title = ?, body = ? WHERE id = ?",
            title,
            body,
            id,
        )
        if (updated == 0) {
            return null
        }
        jdbc.update(
            "UPDATE content_nodes SET title = ?, body = ? WHERE id = ?",
            title,
            body,
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
}

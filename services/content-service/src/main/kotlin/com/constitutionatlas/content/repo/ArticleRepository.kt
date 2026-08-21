package com.constitutionatlas.content.repo

import com.constitutionatlas.content.api.ArticleDetail
import com.constitutionatlas.content.api.ArticleSummary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class ArticleRepository(private val jdbc: JdbcTemplate) {
    fun listByVersion(versionId: UUID): List<ArticleSummary> =
        jdbc.query(
            """
            SELECT id, version_id, article_number, title, sort_order
            FROM articles
            WHERE version_id = ?
            ORDER BY sort_order, article_number
            """.trimIndent(),
            summaryMapper,
            versionId,
        )

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

    private val summaryMapper = RowMapper { rs, _ ->
        ArticleSummary(
            id = rs.getObject("id", UUID::class.java),
            versionId = rs.getObject("version_id", UUID::class.java),
            articleNumber = rs.getString("article_number"),
            title = rs.getString("title"),
            sortOrder = rs.getInt("sort_order"),
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

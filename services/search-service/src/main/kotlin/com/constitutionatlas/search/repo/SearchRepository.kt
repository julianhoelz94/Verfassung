package com.constitutionatlas.search.repo

import com.constitutionatlas.search.api.SearchHit
import com.constitutionatlas.search.client.IndexableArticle
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
class SearchRepository(private val jdbcTemplate: JdbcTemplate) {
    @Transactional
    fun replaceAll(documents: List<IndexableArticle>) {
        jdbcTemplate.update("DELETE FROM search_documents")
        for (doc in documents) {
            jdbcTemplate.update(
                """
                INSERT INTO search_documents (document_id, version_id, country_code, article_number, title, body)
                VALUES (?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                doc.articleId,
                doc.versionId,
                doc.countryCode,
                doc.articleNumber,
                doc.title,
                doc.body,
            )
        }
        jdbcTemplate.update(
            """
            INSERT INTO index_sync_state (source, last_synced_at, document_count, status)
            VALUES ('content', NOW(), ?, 'ready')
            ON CONFLICT (source) DO UPDATE SET
              last_synced_at = EXCLUDED.last_synced_at,
              document_count = EXCLUDED.document_count,
              status = EXCLUDED.status
            """.trimIndent(),
            documents.size,
        )
    }

    fun search(query: String, limit: Int): List<SearchHit> {
        if (query.isBlank()) {
            return emptyList()
        }
        return jdbcTemplate.query(
            """
            SELECT document_id, version_id, country_code, article_number, title,
                   ts_headline(
                     'simple',
                     body,
                     plainto_tsquery('simple', ?),
                     'MaxWords=24, MinWords=12, StartSel=<<, StopSel=>>'
                   ) AS snippet,
                   ts_rank(tsv, plainto_tsquery('simple', ?)) AS rank
            FROM search_documents
            WHERE tsv @@ plainto_tsquery('simple', ?)
            ORDER BY rank DESC, article_number
            LIMIT ?
            """.trimIndent(),
            { rs, _ ->
                SearchHit(
                    articleId = rs.getObject("document_id", UUID::class.java),
                    versionId = rs.getObject("version_id", UUID::class.java),
                    countryCode = rs.getString("country_code"),
                    articleNumber = rs.getString("article_number"),
                    title = rs.getString("title"),
                    snippet = (rs.getString("snippet") ?: "").replace("<<", "").replace(">>", ""),
                    rank = rs.getDouble("rank"),
                )
            },
            query,
            query,
            query,
            limit,
        )
    }
}

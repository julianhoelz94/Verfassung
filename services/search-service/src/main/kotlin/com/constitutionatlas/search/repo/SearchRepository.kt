package com.constitutionatlas.search.repo

import com.constitutionatlas.search.api.CountryFacet
import com.constitutionatlas.search.api.DateFacet
import com.constitutionatlas.search.api.SearchFacets
import com.constitutionatlas.search.api.SearchHit
import com.constitutionatlas.search.api.SearchQuery
import com.constitutionatlas.search.api.VersionFacet
import com.constitutionatlas.search.client.IndexableArticle
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.Date
import java.util.UUID

@Repository
class SearchRepository(private val jdbcTemplate: JdbcTemplate) {
    @Transactional
    fun replaceAll(documents: List<IndexableArticle>) {
        jdbcTemplate.update("DELETE FROM search_documents")
        for (doc in documents) {
            jdbcTemplate.update(
                """
                INSERT INTO search_documents (
                  document_id, version_id, country_code, constitution_title, version_label,
                  effective_date, article_number, title, body
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                doc.articleId,
                doc.versionId,
                doc.countryCode,
                doc.constitutionTitle,
                doc.versionLabel,
                doc.effectiveDate?.let { Date.valueOf(it) },
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

    fun search(query: SearchQuery): List<SearchHit> {
        if (query.text.isBlank()) {
            return emptyList()
        }
        return jdbcTemplate.query(
            """
            SELECT document_id, version_id, country_code, constitution_title, version_label,
                   effective_date, article_number, title,
                   ts_headline(
                     'simple',
                     body,
                     plainto_tsquery('simple', ?),
                     'MaxWords=24, MinWords=12, StartSel=<<, StopSel=>>'
                   ) AS snippet,
                   ts_rank(tsv, plainto_tsquery('simple', ?)) AS rank
            FROM search_documents
            WHERE tsv @@ plainto_tsquery('simple', ?)
              AND (? IS NULL OR country_code = ?)
              AND (?::uuid IS NULL OR version_id = ?)
              AND (?::date IS NULL OR effective_date = ?)
            ORDER BY rank DESC, article_number
            LIMIT ?
            """.trimIndent(),
            { rs, _ ->
                SearchHit(
                    articleId = rs.getObject("document_id", UUID::class.java),
                    versionId = rs.getObject("version_id", UUID::class.java),
                    countryCode = rs.getString("country_code"),
                    constitutionTitle = rs.getString("constitution_title"),
                    versionLabel = rs.getString("version_label"),
                    effectiveDate = rs.getDate("effective_date")?.toLocalDate(),
                    articleNumber = rs.getString("article_number"),
                    title = rs.getString("title"),
                    snippet = (rs.getString("snippet") ?: "").replace("<<", "").replace(">>", ""),
                    rank = rs.getDouble("rank"),
                )
            },
            query.text,
            query.text,
            query.text,
            query.countryCode,
            query.countryCode,
            query.versionId,
            query.versionId,
            query.effectiveDate?.let { Date.valueOf(it) },
            query.effectiveDate?.let { Date.valueOf(it) },
            query.limit,
        )
    }

    fun facets(): SearchFacets {
        val countries =
            jdbcTemplate.query(
                """
                SELECT country_code AS code, COUNT(*)::int AS count
                FROM search_documents
                GROUP BY country_code
                ORDER BY country_code
                """.trimIndent(),
            ) { rs, _ ->
                CountryFacet(
                    code = rs.getString("code"),
                    count = rs.getInt("count"),
                )
            }
        val versions =
            jdbcTemplate.query(
                """
                SELECT version_id, version_label, constitution_title, country_code, COUNT(*)::int AS count
                FROM search_documents
                GROUP BY version_id, version_label, constitution_title, country_code
                ORDER BY country_code, constitution_title, version_label
                """.trimIndent(),
            ) { rs, _ ->
                VersionFacet(
                    id = rs.getObject("version_id", UUID::class.java),
                    label = rs.getString("version_label"),
                    constitutionTitle = rs.getString("constitution_title"),
                    countryCode = rs.getString("country_code"),
                    count = rs.getInt("count"),
                )
            }
        val dates =
            jdbcTemplate.query(
                """
                SELECT effective_date, COUNT(*)::int AS count
                FROM search_documents
                WHERE effective_date IS NOT NULL
                GROUP BY effective_date
                ORDER BY effective_date
                """.trimIndent(),
            ) { rs, _ ->
                DateFacet(
                    effectiveDate = rs.getDate("effective_date")?.toLocalDate()
                        ?: error("effective_date was null"),
                    count = rs.getInt("count"),
                )
            }
        return SearchFacets(countries = countries, versions = versions, dates = dates)
    }
}

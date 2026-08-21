package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.ConstitutionSummary
import com.constitutionatlas.catalog.api.CountryDetail
import com.constitutionatlas.catalog.api.CountrySummary
import com.constitutionatlas.catalog.api.VersionSummary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class CatalogRepository(private val jdbc: JdbcTemplate) {
    fun listCountries(): List<CountrySummary> =
        jdbc.query(
            """
            SELECT id, iso_code, name
            FROM countries
            ORDER BY name
            """.trimIndent(),
            countrySummaryMapper,
        )

    fun findCountryDetail(isoCode: String): CountryDetail? {
        val country = jdbc.query(
            """
            SELECT id, iso_code, name
            FROM countries
            WHERE iso_code = ?
            """.trimIndent(),
            countrySummaryMapper,
            isoCode.uppercase(),
        ).firstOrNull() ?: return null

        val constitutions = jdbc.query(
            """
            SELECT id, slug, title
            FROM constitutions
            WHERE country_id = ?
            ORDER BY title
            """.trimIndent(),
            { rs, _ ->
                Triple(
                    rs.getObject("id", UUID::class.java),
                    rs.getString("slug"),
                    rs.getString("title"),
                )
            },
            country.id,
        ).map { (id, slug, title) ->
            ConstitutionSummary(id, slug, title, listPublishedVersions(id))
        }

        return CountryDetail(country.id, country.isoCode, country.name, constitutions)
    }

    fun listPublishedVersions(constitutionId: UUID): List<VersionSummary> =
        jdbc.query(
            """
            SELECT id, version_label, effective_date, language_code, source_url, gazette_reference
            FROM constitution_versions
            WHERE constitution_id = ?
              AND publication_status = 'published'
            ORDER BY effective_date NULLS LAST, version_label
            """.trimIndent(),
            versionMapper,
            constitutionId,
        )

    fun constitutionExists(constitutionId: UUID): Boolean {
        val count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM constitutions WHERE id = ?",
            Int::class.java,
            constitutionId,
        )
        return (count ?: 0) > 0
    }

    private val countrySummaryMapper = RowMapper { rs, _ ->
        CountrySummary(
            id = rs.getObject("id", UUID::class.java),
            isoCode = rs.getString("iso_code"),
            name = rs.getString("name"),
        )
    }

    private val versionMapper = RowMapper { rs, _ ->
        VersionSummary(
            id = rs.getObject("id", UUID::class.java),
            versionLabel = rs.getString("version_label"),
            effectiveDate = rs.getDate("effective_date")?.toLocalDate(),
            languageCode = rs.getString("language_code"),
            sourceUrl = rs.getString("source_url"),
            gazetteReference = rs.getString("gazette_reference"),
        )
    }
}

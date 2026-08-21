package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.ConstitutionSummary
import com.constitutionatlas.catalog.api.CountryDetail
import com.constitutionatlas.catalog.api.CountrySummary
import com.constitutionatlas.catalog.api.VersionCreated
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

    fun findCountrySummary(isoCode: String): CountrySummary? =
        jdbc.query(
            "SELECT id, iso_code, name FROM countries WHERE iso_code = ?",
            countrySummaryMapper,
            isoCode.uppercase(),
        ).firstOrNull()

    fun insertCountry(isoCode: String, name: String): CountrySummary {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO countries (id, iso_code, name) VALUES (?, ?, ?)",
            id,
            isoCode.uppercase(),
            name,
        )
        return CountrySummary(id, isoCode.uppercase(), name)
    }

    fun findConstitutionId(countryId: UUID, slug: String): UUID? =
        jdbc.query(
            "SELECT id FROM constitutions WHERE country_id = ? AND slug = ?",
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            countryId,
            slug,
        ).firstOrNull()

    fun insertConstitution(countryId: UUID, slug: String, title: String): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO constitutions (id, country_id, slug, title) VALUES (?, ?, ?, ?)",
            id,
            countryId,
            slug,
            title,
        )
        return id
    }

    fun versionLabelExists(constitutionId: UUID, versionLabel: String): Boolean {
        val count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM constitution_versions WHERE constitution_id = ? AND version_label = ?",
            Int::class.java,
            constitutionId,
            versionLabel,
        )
        return (count ?: 0) > 0
    }

    fun insertDraftVersion(
        constitutionId: UUID,
        versionLabel: String,
        effectiveDate: java.time.LocalDate?,
        languageCode: String,
        sourceUrl: String?,
        gazetteReference: String?,
    ): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO constitution_versions (
              id, constitution_id, version_label, effective_date, publication_status,
              language_code, source_url, gazette_reference
            ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
            """.trimIndent(),
            id,
            constitutionId,
            versionLabel,
            effectiveDate?.let { java.sql.Date.valueOf(it) },
            languageCode,
            sourceUrl,
            gazetteReference,
        )
        return id
    }

    fun publishVersion(versionId: UUID): Boolean =
        jdbc.update(
            "UPDATE constitution_versions SET publication_status = 'published' WHERE id = ?",
            versionId,
        ) > 0

    fun findVersionCreated(versionId: UUID): VersionCreated? =
        jdbc.query(
            """
            SELECT id, constitution_id, version_label, publication_status
            FROM constitution_versions
            WHERE id = ?
            """.trimIndent(),
            { rs, _ ->
                VersionCreated(
                    id = rs.getObject("id", UUID::class.java),
                    constitutionId = rs.getObject("constitution_id", UUID::class.java),
                    versionLabel = rs.getString("version_label"),
                    publicationStatus = rs.getString("publication_status"),
                )
            },
            versionId,
        ).firstOrNull()

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

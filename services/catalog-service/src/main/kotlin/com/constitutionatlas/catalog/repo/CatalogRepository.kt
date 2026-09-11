package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.ConstitutionSummary
import com.constitutionatlas.catalog.api.ContentOutlineDto
import com.constitutionatlas.catalog.api.CountryDetail
import com.constitutionatlas.catalog.api.CountrySummary
import com.constitutionatlas.catalog.api.NodeKindDto
import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.api.VersionCreated
import com.constitutionatlas.catalog.api.VersionDetail
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
            SELECT
              c.id,
              c.iso_code,
              c.name,
              latest.version_label AS latest_version_label,
              latest.effective_date AS latest_effective_date,
              latest.id AS latest_version_id,
              COALESCE(counts.version_count, 0) AS version_count
            FROM countries c
            LEFT JOIN LATERAL (
              SELECT cv.id, cv.version_label, cv.effective_date
              FROM constitutions cons
              JOIN constitution_versions cv ON cv.constitution_id = cons.id
              WHERE cons.country_id = c.id
                AND cv.publication_status = 'published'
                AND NOT EXISTS (
                  SELECT 1
                  FROM constitution_versions successor
                  WHERE successor.predecessor_version_id = cv.id
                    AND successor.publication_status = 'published'
                )
              ORDER BY cv.effective_date DESC NULLS LAST, cv.version_label DESC
              LIMIT 1
            ) latest ON TRUE
            LEFT JOIN (
              SELECT cons.country_id, COUNT(*)::int AS version_count
              FROM constitutions cons
              JOIN constitution_versions cv ON cv.constitution_id = cons.id
              WHERE cv.publication_status = 'published'
                AND cv.listing = 'public'
              GROUP BY cons.country_id
            ) counts ON counts.country_id = c.id
            ORDER BY c.name
            """.trimIndent(),
            countryListMapper,
        )

    fun findCountryDetail(isoCode: String): CountryDetail? {
        val country = jdbc.query(
            """
            SELECT id, iso_code, name
            FROM countries
            WHERE iso_code = ?
            """.trimIndent(),
            countryIdNameMapper,
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
            ConstitutionSummary(
                id,
                slug,
                title,
                findChainTipId(id),
                listPublishedPublicVersions(id),
                findOutline(id),
            )
        }

        return CountryDetail(country.id, country.isoCode, country.name, constitutions)
    }

    fun listPublishedPublicVersions(constitutionId: UUID): List<VersionSummary> {
        val tipId = findChainTipId(constitutionId)
        val versions =
            jdbc.query(
                """
                SELECT id, version_label, effective_date, language_code, source_url, gazette_reference,
                       provenance, verification_state, verified_by, verified_at,
                       predecessor_version_id, hop_kind, listing
                FROM constitution_versions
                WHERE constitution_id = ?
                  AND publication_status = 'published'
                  AND listing = 'public'
                ORDER BY effective_date NULLS LAST, version_label
                """.trimIndent(),
                versionMapper,
                constitutionId,
            )
        return versions.map { version ->
            version.copy(latestPublished = tipId != null && version.id == tipId)
        }
    }

    fun listAllPublishedVersions(constitutionId: UUID): List<VersionSummary> {
        val tipId = findChainTipId(constitutionId)
        val versions =
            jdbc.query(
                """
                SELECT id, version_label, effective_date, language_code, source_url, gazette_reference,
                       provenance, verification_state, verified_by, verified_at,
                       predecessor_version_id, hop_kind, listing
                FROM constitution_versions
                WHERE constitution_id = ?
                  AND publication_status = 'published'
                ORDER BY effective_date NULLS LAST, version_label
                """.trimIndent(),
                versionMapper,
                constitutionId,
            )
        return versions.map { version ->
            version.copy(latestPublished = tipId != null && version.id == tipId)
        }
    }

    fun findChainTipId(constitutionId: UUID): UUID? =
        jdbc.query(
            """
            SELECT cv.id
            FROM constitution_versions cv
            WHERE cv.constitution_id = ?
              AND cv.publication_status = 'published'
              AND NOT EXISTS (
                SELECT 1
                FROM constitution_versions successor
                WHERE successor.predecessor_version_id = cv.id
                  AND successor.publication_status = 'published'
              )
            ORDER BY cv.effective_date DESC NULLS LAST, cv.version_label DESC
            LIMIT 1
            """.trimIndent(),
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            constitutionId,
        ).firstOrNull()

    fun findVersionConstitutionId(versionId: UUID): UUID? =
        jdbc.query(
            "SELECT constitution_id FROM constitution_versions WHERE id = ?",
            { rs, _ -> rs.getObject("constitution_id", UUID::class.java) },
            versionId,
        ).firstOrNull()

    fun findSuccessorOf(predecessorVersionId: UUID): UUID? =
        jdbc.query(
            "SELECT id FROM constitution_versions WHERE predecessor_version_id = ? LIMIT 1",
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            predecessorVersionId,
        ).firstOrNull()

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
            countryIdNameMapper,
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
        insertDefaultOutline(id)
        return id
    }

    fun insertDefaultOutline(constitutionId: UUID) {
        jdbc.update(
            """
            INSERT INTO constitution_node_kinds (
              id, constitution_id, kind_code, display_label, sort_order, may_hold_text, may_hold_children,
              presentation, show_label, show_title, show_kind
            ) VALUES (?, ?, 'article', 'Article', 1, TRUE, FALSE, 'section', TRUE, TRUE, TRUE)
            """.trimIndent(),
            UUID.randomUUID(),
            constitutionId,
        )
    }

    fun findOutline(constitutionId: UUID): ContentOutlineDto {
        val edges = jdbc.query(
            """
            SELECT parent_kind_code, child_kind_code
            FROM constitution_node_kind_edges
            WHERE constitution_id = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("parent_kind_code") to rs.getString("child_kind_code") },
            constitutionId,
        ).groupBy({ it.first }, { it.second })
        val kinds = jdbc.query(
            """
            SELECT kind_code, display_label, sort_order, may_hold_text, may_hold_children,
                   presentation, show_label, show_title, show_kind
            FROM constitution_node_kinds
            WHERE constitution_id = ?
            ORDER BY sort_order
            """.trimIndent(),
            { rs, _ ->
                val code = rs.getString("kind_code")
                NodeKindDto(
                    kindCode = code,
                    displayLabel = rs.getString("display_label"),
                    sortOrder = rs.getInt("sort_order"),
                    mayHoldText = rs.getBoolean("may_hold_text"),
                    mayHoldChildren = rs.getBoolean("may_hold_children"),
                    allowedChildKinds = edges[code].orEmpty(),
                    presentation = rs.getString("presentation"),
                    showLabel = rs.getBoolean("show_label"),
                    showTitle = rs.getBoolean("show_title"),
                    showKind = rs.getBoolean("show_kind"),
                )
            },
            constitutionId,
        )
        return ContentOutlineDto(kinds)
    }

    fun listAllVersionIds(constitutionId: UUID): List<UUID> =
        jdbc.query(
            "SELECT id FROM constitution_versions WHERE constitution_id = ?",
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            constitutionId,
        )

    fun replaceOutline(constitutionId: UUID, kinds: List<OutlineKindWrite>) {
        jdbc.update("DELETE FROM constitution_node_kind_edges WHERE constitution_id = ?", constitutionId)
        jdbc.update("DELETE FROM constitution_node_kinds WHERE constitution_id = ?", constitutionId)
        kinds.forEachIndexed { index, kind ->
            val last = index == kinds.lastIndex
            jdbc.update(
                """
                INSERT INTO constitution_node_kinds (
                  id, constitution_id, kind_code, display_label, sort_order, may_hold_text, may_hold_children,
                  presentation, show_label, show_title, show_kind
                ) VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?)
                """.trimIndent(),
                UUID.randomUUID(),
                constitutionId,
                kind.kindCode,
                kind.displayLabel,
                index + 1,
                !last,
                kind.presentation,
                kind.showLabel,
                kind.showTitle,
                kind.showKind,
            )
        }
        kinds.zipWithNext().forEach { (parent, child) ->
            jdbc.update(
                """
                INSERT INTO constitution_node_kind_edges (constitution_id, parent_kind_code, child_kind_code)
                VALUES (?, ?, ?)
                """.trimIndent(),
                constitutionId,
                parent.kindCode,
                child.kindCode,
            )
        }
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
        predecessorVersionId: UUID?,
        hopKind: String,
        listing: String,
    ): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO constitution_versions (
              id, constitution_id, version_label, effective_date, publication_status,
              language_code, source_url, gazette_reference, provenance, verification_state,
              predecessor_version_id, hop_kind, listing
            ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 'imported', 'unverified', ?, ?, ?)
            """.trimIndent(),
            id,
            constitutionId,
            versionLabel,
            effectiveDate?.let { java.sql.Date.valueOf(it) },
            languageCode,
            sourceUrl,
            gazetteReference,
            predecessorVersionId,
            hopKind,
            listing,
        )
        if (!sourceUrl.isNullOrBlank() || !gazetteReference.isNullOrBlank()) {
            jdbc.update(
                """
                INSERT INTO constitution_sources (
                  id, constitution_version_id, source_url, gazette_reference, provenance, verification_state
                ) VALUES (?, ?, ?, ?, 'imported', 'unverified')
                """.trimIndent(),
                UUID.randomUUID(),
                id,
                sourceUrl,
                gazetteReference,
            )
        }
        return id
    }

    fun publishVersion(versionId: UUID): Boolean =
        jdbc.update(
            "UPDATE constitution_versions SET publication_status = 'published' WHERE id = ?",
            versionId,
        ) > 0

    fun findVersionCreated(versionId: UUID): VersionCreated? =
        findVersion(versionId)?.let {
            VersionCreated(
                it.id,
                it.constitutionId,
                it.versionLabel,
                it.publicationStatus,
                it.predecessorVersionId,
                it.hopKind,
                it.listing,
            )
        }

    fun findVersion(versionId: UUID): VersionDetail? =
        jdbc.query(
            """
            SELECT id, constitution_id, version_label, publication_status, effective_date, language_code,
                   predecessor_version_id, hop_kind, listing
            FROM constitution_versions
            WHERE id = ?
            """.trimIndent(),
            versionDetailMapper,
            versionId,
        ).firstOrNull()

    private val countryIdNameMapper = RowMapper { rs, _ ->
        CountrySummary(
            id = rs.getObject("id", UUID::class.java),
            isoCode = rs.getString("iso_code"),
            name = rs.getString("name"),
        )
    }

    private val countryListMapper = RowMapper { rs, _ ->
        CountrySummary(
            id = rs.getObject("id", UUID::class.java),
            isoCode = rs.getString("iso_code"),
            name = rs.getString("name"),
            latestVersionLabel = rs.getString("latest_version_label"),
            latestEffectiveDate = rs.getDate("latest_effective_date")?.toLocalDate(),
            latestVersionId = rs.getObject("latest_version_id", UUID::class.java),
            versionCount = rs.getInt("version_count"),
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
            provenance = rs.getString("provenance"),
            verificationState = rs.getString("verification_state"),
            verifiedBy = rs.getString("verified_by"),
            verifiedAt = rs.getTimestamp("verified_at")?.toInstant()?.atOffset(java.time.ZoneOffset.UTC),
            predecessorVersionId = rs.getObject("predecessor_version_id", UUID::class.java),
            hopKind = rs.getString("hop_kind"),
            listing = rs.getString("listing"),
        )
    }

    private val versionDetailMapper = RowMapper { rs, _ ->
        VersionDetail(
            id = rs.getObject("id", UUID::class.java),
            constitutionId = rs.getObject("constitution_id", UUID::class.java),
            versionLabel = rs.getString("version_label"),
            publicationStatus = rs.getString("publication_status"),
            effectiveDate = rs.getDate("effective_date")?.toLocalDate(),
            languageCode = rs.getString("language_code"),
            predecessorVersionId = rs.getObject("predecessor_version_id", UUID::class.java),
            hopKind = rs.getString("hop_kind"),
            listing = rs.getString("listing"),
        )
    }
}

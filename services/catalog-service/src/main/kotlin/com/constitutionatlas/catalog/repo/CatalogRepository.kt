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
              SELECT tip.id, legal.version_label, legal.effective_date
              FROM constitutions cons
              JOIN constitution_versions legal ON legal.constitution_id = cons.id
              JOIN LATERAL (
                SELECT cv.id
                FROM constitution_versions cv
                WHERE cv.legal_version_id = legal.id
                  AND cv.publication_status = 'published'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM constitution_versions successor
                    WHERE successor.legal_version_id = cv.legal_version_id
                      AND successor.editorial_predecessor_version_id = cv.id
                      AND successor.publication_status = 'published'
                  )
                ORDER BY cv.effective_date DESC NULLS LAST, cv.version_label DESC
                LIMIT 1
              ) tip ON TRUE
              WHERE cons.country_id = c.id
                AND legal.publication_status = 'published'
                AND legal.hop_kind IN ('initial', 'legal')
                AND NOT EXISTS (
                  SELECT 1
                  FROM constitution_versions suc
                  JOIN constitution_versions pred ON pred.id = suc.legal_predecessor_version_id
                  WHERE suc.hop_kind = 'legal'
                    AND suc.publication_status = 'published'
                    AND pred.legal_version_id = legal.id
                )
              ORDER BY legal.effective_date DESC NULLS LAST, legal.version_label DESC
              LIMIT 1
            ) latest ON TRUE
            LEFT JOIN (
              SELECT cons.country_id, COUNT(*)::int AS version_count
              FROM constitutions cons
              JOIN constitution_versions cv ON cv.constitution_id = cons.id
              WHERE cv.publication_status = 'published'
                AND cv.hop_kind IN ('initial', 'legal')
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
                findLegalTipEditorialTipId(id, publishedOnly = true),
                listPublishedPublicVersions(id),
                findOutline(id),
            )
        }

        return CountryDetail(country.id, country.isoCode, country.name, constitutions)
    }

    fun listPublishedPublicVersions(constitutionId: UUID): List<VersionSummary> {
        val tipId = findLegalTipEditorialTipId(constitutionId, publishedOnly = true)
        val versions =
            jdbc.query(
                """
                SELECT tip.id,
                       legal.version_label, legal.effective_date, legal.language_code, legal.source_url,
                       legal.gazette_reference, legal.provenance, legal.verification_state,
                       legal.verified_by, legal.verified_at,
                       legal.legal_predecessor_version_id AS predecessor_version_id,
                       legal.hop_kind, 'public' AS listing,
                       legal.id AS legal_version_id,
                       tip.id AS current_version_id,
                       legal.legal_predecessor_version_id,
                       NULL::uuid AS editorial_predecessor_version_id
                FROM constitution_versions legal
                JOIN LATERAL (
                  SELECT cv.id
                  FROM constitution_versions cv
                  WHERE cv.legal_version_id = legal.id
                    AND cv.publication_status = 'published'
                    AND NOT EXISTS (
                      SELECT 1
                      FROM constitution_versions successor
                      WHERE successor.legal_version_id = cv.legal_version_id
                        AND successor.editorial_predecessor_version_id = cv.id
                        AND successor.publication_status = 'published'
                    )
                  ORDER BY cv.effective_date DESC NULLS LAST, cv.version_label DESC
                  LIMIT 1
                ) tip ON TRUE
                WHERE legal.constitution_id = ?
                  AND legal.publication_status = 'published'
                  AND legal.hop_kind IN ('initial', 'legal')
                ORDER BY legal.effective_date NULLS LAST, legal.version_label
                """.trimIndent(),
                versionMapper,
                constitutionId,
            )
        return versions.map { version ->
            version.copy(latestPublished = tipId != null && version.currentVersionId == tipId)
        }
    }

    fun listAllPublishedVersions(constitutionId: UUID): List<VersionSummary> {
        val tipId = findLegalTipEditorialTipId(constitutionId, publishedOnly = true)
        val versions =
            jdbc.query(
                """
                SELECT cv.id, cv.version_label, cv.effective_date, cv.language_code, cv.source_url,
                       cv.gazette_reference, cv.provenance, cv.verification_state, cv.verified_by,
                       cv.verified_at, cv.predecessor_version_id, cv.hop_kind, cv.listing,
                       cv.legal_version_id,
                       tip.id AS current_version_id,
                       cv.legal_predecessor_version_id,
                       cv.editorial_predecessor_version_id
                FROM constitution_versions cv
                JOIN LATERAL (
                  SELECT t.id
                  FROM constitution_versions t
                  WHERE t.legal_version_id = cv.legal_version_id
                    AND t.publication_status = 'published'
                    AND NOT EXISTS (
                      SELECT 1
                      FROM constitution_versions successor
                      WHERE successor.legal_version_id = t.legal_version_id
                        AND successor.editorial_predecessor_version_id = t.id
                        AND successor.publication_status = 'published'
                    )
                  ORDER BY t.effective_date DESC NULLS LAST, t.version_label DESC
                  LIMIT 1
                ) tip ON TRUE
                WHERE cv.constitution_id = ?
                  AND cv.publication_status = 'published'
                ORDER BY cv.effective_date NULLS LAST, cv.version_label
                """.trimIndent(),
                versionMapper,
                constitutionId,
            )
        return versions.map { version ->
            version.copy(latestPublished = tipId != null && version.id == tipId)
        }
    }

    fun findEditorialTipId(legalVersionId: UUID, publishedOnly: Boolean = false): UUID? {
        val publishedClause = if (publishedOnly) "AND cv.publication_status = 'published'" else ""
        val successorPublished = if (publishedOnly) "AND successor.publication_status = 'published'" else ""
        return jdbc.query(
            """
            SELECT cv.id
            FROM constitution_versions cv
            WHERE cv.legal_version_id = ?
              $publishedClause
              AND NOT EXISTS (
                SELECT 1
                FROM constitution_versions successor
                WHERE successor.legal_version_id = cv.legal_version_id
                  AND successor.editorial_predecessor_version_id = cv.id
                  $successorPublished
              )
            ORDER BY cv.effective_date DESC NULLS LAST, cv.version_label DESC
            LIMIT 1
            """.trimIndent(),
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            legalVersionId,
        ).firstOrNull()
    }

    fun findLegalTipEditorialTipId(constitutionId: UUID, publishedOnly: Boolean = false): UUID? {
        val legalId = findLegalTipId(constitutionId, publishedOnly) ?: return null
        return findEditorialTipId(legalId, publishedOnly)
    }

    fun findLegalTipId(constitutionId: UUID, publishedOnly: Boolean = false): UUID? {
        val publishedLegal = if (publishedOnly) "AND legal.publication_status = 'published'" else ""
        val publishedSuc = if (publishedOnly) "AND suc.publication_status = 'published'" else ""
        return jdbc.query(
            """
            SELECT legal.id
            FROM constitution_versions legal
            WHERE legal.constitution_id = ?
              AND legal.hop_kind IN ('initial', 'legal')
              $publishedLegal
              AND NOT EXISTS (
                SELECT 1
                FROM constitution_versions suc
                JOIN constitution_versions pred ON pred.id = suc.legal_predecessor_version_id
                WHERE suc.hop_kind = 'legal'
                  $publishedSuc
                  AND pred.legal_version_id = legal.id
              )
            ORDER BY legal.effective_date DESC NULLS LAST, legal.version_label DESC
            LIMIT 1
            """.trimIndent(),
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            constitutionId,
        ).firstOrNull()
    }

    fun findChainTipId(constitutionId: UUID): UUID? =
        findLegalTipEditorialTipId(constitutionId, publishedOnly = true)

    fun findVersionConstitutionId(versionId: UUID): UUID? =
        jdbc.query(
            "SELECT constitution_id FROM constitution_versions WHERE id = ?",
            { rs, _ -> rs.getObject("constitution_id", UUID::class.java) },
            versionId,
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
        id: UUID,
        constitutionId: UUID,
        versionLabel: String,
        effectiveDate: java.time.LocalDate?,
        languageCode: String,
        sourceUrl: String?,
        gazetteReference: String?,
        predecessorVersionId: UUID?,
        hopKind: String,
        listing: String,
        legalVersionId: UUID,
        legalPredecessorVersionId: UUID?,
        editorialPredecessorVersionId: UUID?,
    ): UUID {
        jdbc.update(
            """
            INSERT INTO constitution_versions (
              id, constitution_id, version_label, effective_date, publication_status,
              language_code, source_url, gazette_reference, provenance, verification_state,
              predecessor_version_id, hop_kind, listing,
              legal_version_id, legal_predecessor_version_id, editorial_predecessor_version_id
            ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 'imported', 'unverified', ?, ?, ?, ?, ?, ?)
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
            legalVersionId,
            legalPredecessorVersionId,
            editorialPredecessorVersionId,
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
                it.legalVersionId,
                it.currentVersionId,
                it.legalPredecessorVersionId,
                it.editorialPredecessorVersionId,
            )
        }

    fun findVersion(versionId: UUID): VersionDetail? =
        jdbc.query(
            """
            SELECT cv.id, cv.constitution_id, cv.version_label, cv.publication_status, cv.effective_date,
                   cv.language_code, cv.predecessor_version_id, cv.hop_kind, cv.listing,
                   cv.legal_version_id,
                   tip.id AS current_version_id,
                   cv.legal_predecessor_version_id,
                   cv.editorial_predecessor_version_id
            FROM constitution_versions cv
            LEFT JOIN LATERAL (
              SELECT t.id
              FROM constitution_versions t
              WHERE t.legal_version_id = cv.legal_version_id
                AND t.publication_status = 'published'
                AND NOT EXISTS (
                  SELECT 1
                  FROM constitution_versions successor
                  WHERE successor.legal_version_id = t.legal_version_id
                    AND successor.editorial_predecessor_version_id = t.id
                    AND successor.publication_status = 'published'
                )
              ORDER BY t.effective_date DESC NULLS LAST, t.version_label DESC
              LIMIT 1
            ) tip ON TRUE
            WHERE cv.id = ?
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
            legalVersionId = rs.getObject("legal_version_id", UUID::class.java),
            currentVersionId = rs.getObject("current_version_id", UUID::class.java),
            legalPredecessorVersionId = rs.getObject("legal_predecessor_version_id", UUID::class.java),
            editorialPredecessorVersionId = rs.getObject("editorial_predecessor_version_id", UUID::class.java),
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
            legalVersionId = rs.getObject("legal_version_id", UUID::class.java),
            currentVersionId = rs.getObject("current_version_id", UUID::class.java),
            legalPredecessorVersionId = rs.getObject("legal_predecessor_version_id", UUID::class.java),
            editorialPredecessorVersionId = rs.getObject("editorial_predecessor_version_id", UUID::class.java),
        )
    }
}

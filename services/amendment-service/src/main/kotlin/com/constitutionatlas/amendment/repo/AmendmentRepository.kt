package com.constitutionatlas.amendment.repo

import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentDocumentDto
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentRevisionDto
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.LocalDate
import java.util.UUID

// Callers: AmendmentService, AmendmentRevisionTest. Unique JDBC repo for amendment_db.
// Schema: V8 comment/documents/pins/review_status; no amendments.kind. User: "Work on Sprint 36"

data class DraftAmendmentInsert(
    val id: UUID,
    val constitutionId: UUID,
    val title: String,
    val comment: String,
)

data class RevisionInsert(
    val id: UUID,
    val amendmentId: UUID,
    val predecessorRevisionId: UUID?,
    val title: String,
    val comment: String,
    val documents: List<AmendmentDocumentDto> = emptyList(),
    val enactedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val sourceVersionId: UUID? = null,
    val targetVersionId: UUID? = null,
    val createdBy: UUID? = null,
)

data class AmendmentChangeInsert(
    val id: UUID,
    val revisionId: UUID,
    val articleId: UUID?,
    val articleNumber: String?,
    val changeType: String,
    val note: String?,
    val nodeId: UUID?,
    val changedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val amendingLawTitle: String?,
    val amendingLawCitation: String?,
)

data class PublishedPinRow(
    val amendmentId: UUID,
    val reviewedSourceTipId: UUID?,
    val reviewedTargetTipId: UUID?,
)

private data class AmendmentRow(
    val dto: AmendmentDto,
    val revisionId: UUID,
)

@Repository
class AmendmentRepository(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun listForTargetVersion(targetVersionId: UUID, sourceVersionId: UUID? = null): List<AmendmentDto> {
        val sql = StringBuilder(
            """
            SELECT $AMENDMENT_COLUMNS,
                   a.published_revision_id AS revision_id
            FROM amendments a
            JOIN amendment_revisions r ON r.id = a.published_revision_id
            LEFT JOIN version_transitions t ON t.id = a.version_transition_id
            WHERE a.status = 'published'
              AND COALESCE(r.target_version_id, t.target_version_id) = ?
            """.trimIndent(),
        )
        if (sourceVersionId != null) {
            sql.append(" AND COALESCE(r.source_version_id, t.source_version_id) = ?")
        }
        sql.append(" ORDER BY r.enacted_on NULLS LAST, r.created_at")
        val amendments = if (sourceVersionId != null) {
            jdbc.query(sql.toString(), publicRowMapper, targetVersionId, sourceVersionId)
        } else {
            jdbc.query(sql.toString(), publicRowMapper, targetVersionId)
        }
        return amendments.map { it.dto.copy(changes = listChanges(it.revisionId)) }
    }

    fun listPublishedForConstitution(constitutionId: UUID): List<AmendmentDto> {
        val amendments =
            jdbc.query(
                """
                SELECT $AMENDMENT_COLUMNS,
                       a.published_revision_id AS revision_id
                FROM amendments a
                JOIN amendment_revisions r ON r.id = a.published_revision_id
                LEFT JOIN version_transitions t ON t.id = a.version_transition_id
                WHERE a.constitution_id = ?
                  AND a.status = 'published'
                ORDER BY r.enacted_on NULLS LAST, r.created_at
                """.trimIndent(),
                publicRowMapper,
                constitutionId,
            )
        return amendments.map { it.dto.copy(changes = listChanges(it.revisionId)) }
    }

    fun listStaffForConstitution(
        constitutionId: UUID,
        status: String? = null,
        reviewStatus: String? = null,
    ): List<AmendmentDto> {
        val sql = StringBuilder(
            """
            SELECT $AMENDMENT_COLUMNS,
                   r.id AS revision_id
            FROM amendments a
            JOIN amendment_revisions r ON r.amendment_id = a.id
              AND NOT EXISTS (
                SELECT 1 FROM amendment_revisions child
                WHERE child.predecessor_revision_id = r.id
              )
            LEFT JOIN version_transitions t ON t.id = a.version_transition_id
            WHERE a.constitution_id = ?
              AND a.status IN ('draft', 'published', 'withdrawn')
            """.trimIndent(),
        )
        val args = mutableListOf<Any>(constitutionId)
        if (status != null) {
            sql.append(" AND a.status = ?")
            args.add(status)
        }
        if (reviewStatus != null) {
            sql.append(" AND a.review_status = ?")
            args.add(reviewStatus)
        }
        sql.append(" ORDER BY r.enacted_on NULLS LAST, r.created_at")
        val amendments = jdbc.query(sql.toString(), staffRowMapper, *args.toTypedArray())
        return amendments.map { it.dto.copy(changes = listChanges(it.revisionId)) }
    }

    fun getPublishedAmendment(id: UUID): AmendmentDto? {
        val row =
            jdbc.query(
                """
                SELECT $AMENDMENT_COLUMNS,
                       a.published_revision_id AS revision_id
                FROM amendments a
                JOIN amendment_revisions r ON r.id = a.published_revision_id
                LEFT JOIN version_transitions t ON t.id = a.version_transition_id
                WHERE a.id = ?
                  AND a.status = 'published'
                """.trimIndent(),
                publicRowMapper,
                id,
            ).firstOrNull() ?: return null
        return row.dto.copy(changes = listChanges(row.revisionId))
    }

    fun listForArticle(constitutionId: UUID, articleNumber: String): List<AmendmentDto> {
        val number = articleNumber.trim()
        if (number.isEmpty()) {
            return emptyList()
        }
        val amendments =
            jdbc.query(
                """
                SELECT DISTINCT $AMENDMENT_COLUMNS,
                       a.published_revision_id AS revision_id
                FROM amendments a
                JOIN amendment_revisions r ON r.id = a.published_revision_id
                LEFT JOIN version_transitions t ON t.id = a.version_transition_id
                JOIN amendment_changes c ON c.revision_id = r.id
                WHERE a.constitution_id = ?
                  AND a.status = 'published'
                  AND lower(c.article_number) = lower(?)
                """.trimIndent(),
                publicRowMapper,
                constitutionId,
                number,
            )
        return amendments
            .map { row ->
                row.dto.copy(
                    changes =
                    listChanges(row.revisionId).filter { change ->
                        change.articleNumber.equals(number, ignoreCase = true)
                    },
                )
            }
            .sortedWith(
                compareBy(nullsLast()) { amendment ->
                    amendment.changes.mapNotNull { it.changedOn }.minOrNull()
                },
            )
    }

    fun listRevisions(amendmentId: UUID): List<AmendmentRevisionDto> {
        val revisions =
            jdbc.query(
                """
                SELECT id, predecessor_revision_id, created_by, created_at, title, comment, documents,
                       enacted_on, effective_on, source_version_id, target_version_id,
                       reviewed_source_tip_id, reviewed_target_tip_id
                FROM amendment_revisions
                WHERE amendment_id = ?
                ORDER BY created_at ASC
                """.trimIndent(),
                { rs, _ ->
                    AmendmentRevisionDto(
                        id = rs.getObject("id", UUID::class.java),
                        predecessorRevisionId = rs.getObject("predecessor_revision_id", UUID::class.java),
                        createdBy = rs.getObject("created_by", UUID::class.java),
                        createdAt = rs.getTimestamp("created_at").toInstant(),
                        title = rs.getString("title"),
                        comment = rs.getString("comment"),
                        documents = parseDocuments(rs.getString("documents")),
                        enactedOn = rs.getDate("enacted_on")?.toLocalDate(),
                        effectiveOn = rs.getDate("effective_on")?.toLocalDate(),
                        sourceVersionId = rs.getObject("source_version_id", UUID::class.java),
                        targetVersionId = rs.getObject("target_version_id", UUID::class.java),
                        changes = emptyList(),
                        reviewedSourceTipId = rs.getObject("reviewed_source_tip_id", UUID::class.java),
                        reviewedTargetTipId = rs.getObject("reviewed_target_tip_id", UUID::class.java),
                    )
                },
                amendmentId,
            )
        return revisions.map { revision -> revision.copy(changes = listChanges(revision.id)) }
    }

    fun listPublishedPins(constitutionId: UUID): List<PublishedPinRow> =
        jdbc.query(
            """
            SELECT a.id, r.reviewed_source_tip_id, r.reviewed_target_tip_id
            FROM amendments a
            JOIN amendment_revisions r ON r.id = a.published_revision_id
            WHERE a.constitution_id = ?
              AND a.status = 'published'
            """.trimIndent(),
            { rs, _ ->
                PublishedPinRow(
                    amendmentId = rs.getObject("id", UUID::class.java),
                    reviewedSourceTipId = rs.getObject("reviewed_source_tip_id", UUID::class.java),
                    reviewedTargetTipId = rs.getObject("reviewed_target_tip_id", UUID::class.java),
                )
            },
            constitutionId,
        )

    fun markNeedsReview(amendmentIds: Collection<UUID>) {
        if (amendmentIds.isEmpty()) {
            return
        }
        val placeholders = amendmentIds.joinToString(",") { "?" }
        jdbc.update(
            "UPDATE amendments SET review_status = 'needs_review' WHERE id IN ($placeholders)",
            *amendmentIds.toTypedArray(),
        )
    }

    fun amendmentExists(id: UUID): Boolean =
        (
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM amendments WHERE id = ?",
                Int::class.java,
                id,
            ) ?: 0
            ) > 0

    fun getAmendmentStatus(id: UUID): String? =
        jdbc.queryForObject(
            "SELECT status FROM amendments WHERE id = ?",
            String::class.java,
            id,
        )

    fun getPublishedRevisionId(id: UUID): UUID? =
        jdbc.queryForObject(
            "SELECT published_revision_id FROM amendments WHERE id = ?",
            UUID::class.java,
            id,
        )

    fun findTipRevisionId(amendmentId: UUID): UUID? =
        jdbc.queryForObject(
            """
            SELECT r.id
            FROM amendment_revisions r
            WHERE r.amendment_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM amendment_revisions child
                WHERE child.predecessor_revision_id = r.id
              )
            ORDER BY r.created_at DESC
            LIMIT 1
            """.trimIndent(),
            UUID::class.java,
            amendmentId,
        )

    fun getAmendmentDtoForRevision(amendmentId: UUID, revisionId: UUID, includeStaff: Boolean = true): AmendmentDto? {
        val row =
            jdbc.query(
                """
                SELECT $AMENDMENT_COLUMNS,
                       r.id AS revision_id
                FROM amendments a
                JOIN amendment_revisions r ON r.id = ?
                LEFT JOIN version_transitions t ON t.id = a.version_transition_id
                WHERE a.id = ?
                """.trimIndent(),
                if (includeStaff) staffRowMapper else publicRowMapper,
                revisionId,
                amendmentId,
            ).firstOrNull() ?: return null
        return row.dto.copy(changes = listChanges(revisionId))
    }

    fun insertDraftAmendment(row: DraftAmendmentInsert) {
        jdbc.update(
            """
            INSERT INTO amendments (
              id, constitution_id, version_transition_id, title, summary, status, review_status
            )
            VALUES (?, ?, NULL, ?, ?, 'draft', 'ok')
            """.trimIndent(),
            row.id,
            row.constitutionId,
            row.title,
            row.comment,
        )
    }

    fun insertRevision(row: RevisionInsert) {
        jdbc.update(
            """
            INSERT INTO amendment_revisions (
              id, amendment_id, predecessor_revision_id, title, comment, documents, enacted_on, effective_on,
              source_version_id, target_version_id, created_by,
              reviewed_source_tip_id, reviewed_target_tip_id
            )
            VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            row.id,
            row.amendmentId,
            row.predecessorRevisionId,
            row.title,
            row.comment,
            objectMapper.writeValueAsString(row.documents),
            row.enactedOn,
            row.effectiveOn,
            row.sourceVersionId,
            row.targetVersionId,
            row.createdBy,
            row.sourceVersionId,
            row.targetVersionId,
        )
    }

    fun insertChanges(revisionId: UUID, changes: List<AmendmentChangeWriteRequest>) {
        changes.forEach { change ->
            insertChange(
                AmendmentChangeInsert(
                    id = UUID.randomUUID(),
                    revisionId = revisionId,
                    articleId = change.articleId,
                    articleNumber = change.articleNumber,
                    changeType = change.changeType,
                    note = change.note,
                    nodeId = change.nodeId,
                    changedOn = change.changedOn,
                    effectiveOn = change.effectiveOn,
                    amendingLawTitle = change.amendingLawTitle,
                    amendingLawCitation = change.amendingLawCitation,
                ),
            )
        }
    }

    fun insertChange(row: AmendmentChangeInsert) {
        jdbc.update(
            """
            INSERT INTO amendment_changes (
              id, revision_id, article_id, article_number, change_type, note,
              node_id, changed_on, effective_on, amending_law_title, amending_law_citation
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            row.id,
            row.revisionId,
            row.articleId,
            row.articleNumber,
            row.changeType,
            row.note,
            row.nodeId,
            row.changedOn,
            row.effectiveOn,
            row.amendingLawTitle,
            row.amendingLawCitation,
        )
    }

    fun publishAmendment(amendmentId: UUID, revisionId: UUID) {
        val previousPublishedId = getPublishedRevisionId(amendmentId)
        markRevisionPublished(amendmentId, revisionId)
        if (previousPublishedId == null) {
            jdbc.update(
                """
                UPDATE amendments
                SET status = 'published', published_revision_id = ?, review_status = 'ok'
                WHERE id = ?
                """.trimIndent(),
                revisionId,
                amendmentId,
            )
            return
        }
        jdbc.update(
            """
            UPDATE amendments
            SET status = 'published',
                published_revision_id = ?,
                review_status = CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM amendment_revisions neu
                    JOIN amendment_revisions old ON old.id = ?
                    WHERE neu.id = ?
                      AND (
                        old.reviewed_source_tip_id IS DISTINCT FROM neu.reviewed_source_tip_id
                        OR old.reviewed_target_tip_id IS DISTINCT FROM neu.reviewed_target_tip_id
                      )
                  ) THEN 'ok'
                  ELSE review_status
                END
            WHERE id = ?
            """.trimIndent(),
            revisionId,
            previousPublishedId,
            revisionId,
            amendmentId,
        )
    }

    fun withdrawAmendment(amendmentId: UUID) {
        jdbc.update(
            """
            UPDATE amendment_revisions SET is_published_tip = false WHERE amendment_id = ?
            """.trimIndent(),
            amendmentId,
        )
        jdbc.update(
            """
            UPDATE amendments SET status = 'withdrawn' WHERE id = ?
            """.trimIndent(),
            amendmentId,
        )
    }

    private fun markRevisionPublished(amendmentId: UUID, revisionId: UUID) {
        jdbc.update(
            """
            UPDATE amendment_revisions SET is_published_tip = false WHERE amendment_id = ?
            """.trimIndent(),
            amendmentId,
        )
        jdbc.update(
            """
            UPDATE amendment_revisions
            SET is_published_tip = true,
                reviewed_source_tip_id = source_version_id,
                reviewed_target_tip_id = target_version_id
            WHERE id = ?
            """.trimIndent(),
            revisionId,
        )
    }

    private val publicRowMapper = org.springframework.jdbc.core.RowMapper { rs, _ ->
        mapAmendmentRow(rs, includeStaff = false)
    }

    private val staffRowMapper = org.springframework.jdbc.core.RowMapper { rs, _ ->
        mapAmendmentRow(rs, includeStaff = true)
    }

    private fun mapAmendmentRow(rs: java.sql.ResultSet, includeStaff: Boolean): AmendmentRow {
        val documents = parseDocuments(rs.getString("documents"))
        return AmendmentRow(
            dto =
            AmendmentDto(
                id = rs.getObject("id", UUID::class.java),
                constitutionId = rs.getObject("constitution_id", UUID::class.java),
                status = rs.getString("status"),
                transitionId = rs.getObject("transition_id", UUID::class.java),
                title = rs.getString("title"),
                comment = rs.getString("comment"),
                documents = documents,
                enactedOn = rs.getDate("enacted_on")?.toLocalDate(),
                effectiveOn = rs.getDate("effective_on")?.toLocalDate(),
                sourceVersionId = rs.getObject("source_version_id", UUID::class.java),
                targetVersionId = rs.getObject("target_version_id", UUID::class.java),
                publishedRevisionId = rs.getObject("published_revision_id", UUID::class.java),
                changes = emptyList(),
                reviewStatus = if (includeStaff) rs.getString("review_status") else null,
                reviewedSourceTipId =
                if (includeStaff) rs.getObject("reviewed_source_tip_id", UUID::class.java) else null,
                reviewedTargetTipId =
                if (includeStaff) rs.getObject("reviewed_target_tip_id", UUID::class.java) else null,
            ),
            revisionId = rs.getObject("revision_id", UUID::class.java),
        )
    }

    private fun parseDocuments(raw: String?): List<AmendmentDocumentDto> {
        if (raw.isNullOrBlank() || raw == "[]") {
            return emptyList()
        }
        return objectMapper.readValue(raw, DOCUMENT_LIST)
    }

    private fun listChanges(revisionId: UUID): List<AmendmentChangeDto> =
        jdbc.query(
            """
            SELECT id, article_id, article_number, change_type, note,
                   node_id, changed_on, effective_on, amending_law_citation_id,
                   amending_law_title, amending_law_citation
            FROM amendment_changes
            WHERE revision_id = ?
            ORDER BY article_number NULLS LAST, change_type
            """.trimIndent(),
            { rs, _ ->
                AmendmentChangeDto(
                    id = rs.getObject("id", UUID::class.java),
                    articleId = rs.getObject("article_id", UUID::class.java),
                    articleNumber = rs.getString("article_number"),
                    changeType = rs.getString("change_type"),
                    note = rs.getString("note"),
                    nodeId = rs.getObject("node_id", UUID::class.java),
                    changedOn = rs.getDate("changed_on")?.toLocalDate(),
                    effectiveOn = rs.getDate("effective_on")?.toLocalDate(),
                    amendingLawCitationId = rs.getObject("amending_law_citation_id", UUID::class.java),
                    amendingLawTitle = rs.getString("amending_law_title"),
                    amendingLawCitation = rs.getString("amending_law_citation"),
                )
            },
            revisionId,
        )

    companion object {
        private val DOCUMENT_LIST = object : TypeReference<List<AmendmentDocumentDto>>() {}

        private const val AMENDMENT_COLUMNS = """
            a.id, a.constitution_id, a.status, a.review_status, a.published_revision_id AS published_revision_id,
            t.id AS transition_id, r.title, r.comment, r.documents, r.enacted_on, r.effective_on,
            COALESCE(r.source_version_id, t.source_version_id) AS source_version_id,
            COALESCE(r.target_version_id, t.target_version_id) AS target_version_id,
            r.reviewed_source_tip_id, r.reviewed_target_tip_id
        """
    }
}

package com.constitutionatlas.amendment.repo

import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentRevisionDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

data class TransitionInsert(
    val id: UUID,
    val sourceVersionId: UUID,
    val targetVersionId: UUID,
    val constitutionId: UUID?,
)

data class AmendmentInsert(
    val id: UUID,
    val constitutionId: UUID?,
    val versionTransitionId: UUID,
    val title: String,
    val summary: String,
    val enactedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val sourceReference: String?,
    val sourceVersionId: UUID,
    val targetVersionId: UUID,
)

data class DraftAmendmentInsert(
    val id: UUID,
    val constitutionId: UUID,
    val kind: String,
    val title: String,
    val summary: String,
)

data class RevisionInsert(
    val id: UUID,
    val amendmentId: UUID,
    val predecessorRevisionId: UUID?,
    val title: String,
    val summary: String,
    val enactedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val sourceReference: String?,
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

private data class AmendmentRow(
    val dto: AmendmentDto,
    val revisionId: UUID,
)

@Repository
class AmendmentRepository(private val jdbc: JdbcTemplate) {
    fun listForTargetVersion(targetVersionId: UUID, sourceVersionId: UUID? = null): List<AmendmentDto> {
        val sql = StringBuilder(
            """
            SELECT a.id, a.constitution_id, a.kind, a.status, a.published_revision_id AS published_revision_id, t.id AS transition_id,
                   r.title, r.summary, r.enacted_on, r.effective_on, r.source_reference,
                   COALESCE(r.source_version_id, t.source_version_id) AS source_version_id,
                   COALESCE(r.target_version_id, t.target_version_id) AS target_version_id,
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
            jdbc.query(sql.toString(), amendmentRowMapper, targetVersionId, sourceVersionId)
        } else {
            jdbc.query(sql.toString(), amendmentRowMapper, targetVersionId)
        }
        return amendments.map { it.dto.copy(changes = listChanges(it.revisionId)) }
    }

    fun listPublishedForConstitution(constitutionId: UUID): List<AmendmentDto> {
        val amendments =
            jdbc.query(
                """
                SELECT a.id, a.constitution_id, a.kind, a.status, a.published_revision_id AS published_revision_id, t.id AS transition_id,
                       r.title, r.summary, r.enacted_on, r.effective_on, r.source_reference,
                       COALESCE(r.source_version_id, t.source_version_id) AS source_version_id,
                       COALESCE(r.target_version_id, t.target_version_id) AS target_version_id,
                       a.published_revision_id AS revision_id
                FROM amendments a
                JOIN amendment_revisions r ON r.id = a.published_revision_id
                LEFT JOIN version_transitions t ON t.id = a.version_transition_id
                WHERE a.constitution_id = ?
                  AND a.status = 'published'
                ORDER BY r.enacted_on NULLS LAST, r.created_at
                """.trimIndent(),
                amendmentRowMapper,
                constitutionId,
            )
        return amendments.map { it.dto.copy(changes = listChanges(it.revisionId)) }
    }

    fun listStaffForConstitution(constitutionId: UUID): List<AmendmentDto> {
        val amendments =
            jdbc.query(
                """
                SELECT a.id, a.constitution_id, a.kind, a.status, a.published_revision_id AS published_revision_id, t.id AS transition_id,
                       r.title, r.summary, r.enacted_on, r.effective_on, r.source_reference,
                       COALESCE(r.source_version_id, t.source_version_id) AS source_version_id,
                       COALESCE(r.target_version_id, t.target_version_id) AS target_version_id,
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
                ORDER BY r.enacted_on NULLS LAST, r.created_at
                """.trimIndent(),
                amendmentRowMapper,
                constitutionId,
            )
        return amendments.map { it.dto.copy(changes = listChanges(it.revisionId)) }
    }

    fun getPublishedAmendment(id: UUID): AmendmentDto? {
        val row =
            jdbc.query(
                """
                SELECT a.id, a.constitution_id, a.kind, a.status, a.published_revision_id AS published_revision_id, t.id AS transition_id,
                       r.title, r.summary, r.enacted_on, r.effective_on, r.source_reference,
                       COALESCE(r.source_version_id, t.source_version_id) AS source_version_id,
                       COALESCE(r.target_version_id, t.target_version_id) AS target_version_id,
                       a.published_revision_id AS revision_id
                FROM amendments a
                JOIN amendment_revisions r ON r.id = a.published_revision_id
                LEFT JOIN version_transitions t ON t.id = a.version_transition_id
                WHERE a.id = ?
                  AND a.status = 'published'
                """.trimIndent(),
                amendmentRowMapper,
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
                SELECT DISTINCT a.id, a.constitution_id, a.kind, a.status, a.published_revision_id AS published_revision_id, t.id AS transition_id,
                       r.title, r.summary, r.enacted_on, r.effective_on, r.source_reference,
                       COALESCE(r.source_version_id, t.source_version_id) AS source_version_id,
                       COALESCE(r.target_version_id, t.target_version_id) AS target_version_id,
                       a.published_revision_id AS revision_id
                FROM amendments a
                JOIN amendment_revisions r ON r.id = a.published_revision_id
                LEFT JOIN version_transitions t ON t.id = a.version_transition_id
                JOIN amendment_changes c ON c.revision_id = r.id
                WHERE a.constitution_id = ?
                  AND a.status = 'published'
                  AND lower(c.article_number) = lower(?)
                """.trimIndent(),
                amendmentRowMapper,
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
                SELECT id, predecessor_revision_id, created_by, created_at, title, summary,
                       enacted_on, effective_on, source_reference, source_version_id, target_version_id
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
                        summary = rs.getString("summary"),
                        enactedOn = rs.getDate("enacted_on")?.toLocalDate(),
                        effectiveOn = rs.getDate("effective_on")?.toLocalDate(),
                        sourceReference = rs.getString("source_reference"),
                        sourceVersionId = rs.getObject("source_version_id", UUID::class.java),
                        targetVersionId = rs.getObject("target_version_id", UUID::class.java),
                        changes = emptyList(),
                    )
                },
                amendmentId,
            )
        return revisions.map { revision -> revision.copy(changes = listChanges(revision.id)) }
    }

    fun amendmentExists(id: UUID): Boolean =
        (
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM amendments WHERE id = ?",
                Int::class.java,
                id,
            ) ?: 0
            ) > 0

    fun getAmendmentKind(id: UUID): String? =
        jdbc.queryForObject(
            "SELECT kind FROM amendments WHERE id = ?",
            String::class.java,
            id,
        )

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

    fun getAmendmentDtoForRevision(amendmentId: UUID, revisionId: UUID): AmendmentDto? {
        val row =
            jdbc.query(
                """
                SELECT a.id, a.constitution_id, a.kind, a.status, a.published_revision_id AS published_revision_id, t.id AS transition_id,
                       r.title, r.summary, r.enacted_on, r.effective_on, r.source_reference,
                       COALESCE(r.source_version_id, t.source_version_id) AS source_version_id,
                       COALESCE(r.target_version_id, t.target_version_id) AS target_version_id,
                       r.id AS revision_id
                FROM amendments a
                JOIN amendment_revisions r ON r.id = ?
                LEFT JOIN version_transitions t ON t.id = a.version_transition_id
                WHERE a.id = ?
                """.trimIndent(),
                amendmentRowMapper,
                revisionId,
                amendmentId,
            ).firstOrNull() ?: return null
        return row.dto.copy(changes = listChanges(revisionId))
    }

    fun transitionExists(sourceVersionId: UUID, targetVersionId: UUID): Boolean =
        (
            jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM version_transitions
                WHERE source_version_id = ? AND target_version_id = ?
                """.trimIndent(),
                Int::class.java,
                sourceVersionId,
                targetVersionId,
            ) ?: 0
            ) > 0

    fun insertTransition(row: TransitionInsert) {
        jdbc.update(
            """
            INSERT INTO version_transitions (id, source_version_id, target_version_id, constitution_id)
            VALUES (?, ?, ?, ?)
            """.trimIndent(),
            row.id,
            row.sourceVersionId,
            row.targetVersionId,
            row.constitutionId,
        )
    }

    fun insertDraftAmendment(row: DraftAmendmentInsert) {
        jdbc.update(
            """
            INSERT INTO amendments (
              id, constitution_id, version_transition_id, title, summary, kind, status
            )
            VALUES (?, ?, NULL, ?, ?, ?, 'draft')
            """.trimIndent(),
            row.id,
            row.constitutionId,
            row.title,
            row.summary,
            row.kind,
        )
    }

    fun insertAmendment(row: AmendmentInsert): UUID {
        val revisionId = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO amendments (
              id, constitution_id, version_transition_id, title, summary, enacted_on, source_reference,
              kind, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'legal_amendment', 'published')
            """.trimIndent(),
            row.id,
            row.constitutionId,
            row.versionTransitionId,
            row.title,
            row.summary,
            row.enactedOn,
            row.sourceReference,
        )
        insertRevision(
            RevisionInsert(
                id = revisionId,
                amendmentId = row.id,
                predecessorRevisionId = null,
                title = row.title,
                summary = row.summary,
                enactedOn = row.enactedOn,
                effectiveOn = row.effectiveOn,
                sourceReference = row.sourceReference,
                sourceVersionId = row.sourceVersionId,
                targetVersionId = row.targetVersionId,
            ),
        )
        jdbc.update(
            """
            UPDATE amendments SET published_revision_id = ? WHERE id = ?
            """.trimIndent(),
            revisionId,
            row.id,
        )
        return revisionId
    }

    fun insertRevision(row: RevisionInsert) {
        jdbc.update(
            """
            INSERT INTO amendment_revisions (
              id, amendment_id, predecessor_revision_id, title, summary, enacted_on, effective_on,
              source_reference, source_version_id, target_version_id, created_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            row.id,
            row.amendmentId,
            row.predecessorRevisionId,
            row.title,
            row.summary,
            row.enactedOn,
            row.effectiveOn,
            row.sourceReference,
            row.sourceVersionId,
            row.targetVersionId,
            row.createdBy,
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
        jdbc.update(
            """
            UPDATE amendments
            SET status = 'published', published_revision_id = ?
            WHERE id = ?
            """.trimIndent(),
            revisionId,
            amendmentId,
        )
    }

    fun withdrawAmendment(amendmentId: UUID) {
        jdbc.update(
            """
            UPDATE amendments SET status = 'withdrawn' WHERE id = ?
            """.trimIndent(),
            amendmentId,
        )
    }

    private val amendmentRowMapper = org.springframework.jdbc.core.RowMapper { rs, _ ->
        AmendmentRow(
            dto =
            AmendmentDto(
                id = rs.getObject("id", UUID::class.java),
                constitutionId = rs.getObject("constitution_id", UUID::class.java),
                kind = rs.getString("kind"),
                status = rs.getString("status"),
                transitionId = rs.getObject("transition_id", UUID::class.java),
                title = rs.getString("title"),
                summary = rs.getString("summary"),
                enactedOn = rs.getDate("enacted_on")?.toLocalDate(),
                effectiveOn = rs.getDate("effective_on")?.toLocalDate(),
                sourceReference = rs.getString("source_reference"),
                sourceVersionId = rs.getObject("source_version_id", UUID::class.java),
                targetVersionId = rs.getObject("target_version_id", UUID::class.java),
                publishedRevisionId = rs.getObject("published_revision_id", UUID::class.java),
                changes = emptyList(),
            ),
            revisionId = rs.getObject("revision_id", UUID::class.java),
        )
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
}

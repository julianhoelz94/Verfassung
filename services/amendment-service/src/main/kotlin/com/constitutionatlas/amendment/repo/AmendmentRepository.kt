package com.constitutionatlas.amendment.repo

import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
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
    val versionTransitionId: UUID,
    val title: String,
    val summary: String,
    val enactedOn: LocalDate?,
    val sourceReference: String?,
)

data class AmendmentChangeInsert(
    val id: UUID,
    val amendmentId: UUID,
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

@Repository
class AmendmentRepository(private val jdbc: JdbcTemplate) {
    fun listForTargetVersion(targetVersionId: UUID, sourceVersionId: UUID? = null): List<AmendmentDto> {
        val sql = StringBuilder(
            """
            SELECT a.id, a.title, a.summary, a.enacted_on, a.source_reference,
                   t.source_version_id, t.target_version_id
            FROM amendments a
            JOIN version_transitions t ON t.id = a.version_transition_id
            WHERE t.target_version_id = ?
            """.trimIndent(),
        )
        if (sourceVersionId != null) {
            sql.append(" AND t.source_version_id = ?")
        }
        sql.append(" ORDER BY a.enacted_on NULLS LAST, a.title")
        val amendments = if (sourceVersionId != null) {
            jdbc.query(sql.toString(), amendmentRowMapper, targetVersionId, sourceVersionId)
        } else {
            jdbc.query(sql.toString(), amendmentRowMapper, targetVersionId)
        }
        return amendments.map { it.copy(changes = listChanges(it.id)) }
    }

    fun listForArticle(constitutionId: UUID, articleNumber: String): List<AmendmentDto> {
        val number = articleNumber.trim()
        if (number.isEmpty()) {
            return emptyList()
        }
        val amendments =
            jdbc.query(
                """
                SELECT DISTINCT a.id, a.title, a.summary, a.enacted_on, a.source_reference,
                       t.source_version_id, t.target_version_id
                FROM amendments a
                JOIN version_transitions t ON t.id = a.version_transition_id
                JOIN amendment_changes c ON c.amendment_id = a.id
                WHERE t.constitution_id = ?
                  AND lower(c.article_number) = lower(?)
                """.trimIndent(),
                amendmentRowMapper,
                constitutionId,
                number,
            )
        return amendments
            .map { amendment ->
                amendment.copy(
                    changes =
                    listChanges(amendment.id).filter { change ->
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

    fun insertAmendment(row: AmendmentInsert) {
        jdbc.update(
            """
            INSERT INTO amendments (id, version_transition_id, title, summary, enacted_on, source_reference)
            VALUES (?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            row.id,
            row.versionTransitionId,
            row.title,
            row.summary,
            row.enactedOn,
            row.sourceReference,
        )
    }

    fun insertChange(row: AmendmentChangeInsert) {
        jdbc.update(
            """
            INSERT INTO amendment_changes (
              id, amendment_id, article_id, article_number, change_type, note,
              node_id, changed_on, effective_on, amending_law_title, amending_law_citation
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            row.id,
            row.amendmentId,
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

    private val amendmentRowMapper = org.springframework.jdbc.core.RowMapper { rs, _ ->
        AmendmentDto(
            id = rs.getObject("id", UUID::class.java),
            title = rs.getString("title"),
            summary = rs.getString("summary"),
            enactedOn = rs.getDate("enacted_on")?.toLocalDate(),
            sourceReference = rs.getString("source_reference"),
            sourceVersionId = rs.getObject("source_version_id", UUID::class.java),
            targetVersionId = rs.getObject("target_version_id", UUID::class.java),
            changes = emptyList(),
        )
    }

    private fun listChanges(amendmentId: UUID): List<AmendmentChangeDto> =
        jdbc.query(
            """
            SELECT id, article_id, article_number, change_type, note,
                   node_id, changed_on, effective_on, amending_law_citation_id,
                   amending_law_title, amending_law_citation
            FROM amendment_changes
            WHERE amendment_id = ?
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
            amendmentId,
        )
}

package com.constitutionatlas.amendment.repo

import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class AmendmentRepository(private val jdbc: JdbcTemplate) {
    fun listForTargetVersion(targetVersionId: UUID): List<AmendmentDto> {
        val amendments = jdbc.query(
            """
            SELECT a.id, a.title, a.summary, a.enacted_on, a.source_reference,
                   t.source_version_id, t.target_version_id
            FROM amendments a
            JOIN version_transitions t ON t.id = a.version_transition_id
            WHERE t.target_version_id = ?
            ORDER BY a.enacted_on NULLS LAST, a.title
            """.trimIndent(),
            { rs, _ ->
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
            },
            targetVersionId,
        )
        return amendments.map { it.copy(changes = listChanges(it.id)) }
    }

    private fun listChanges(amendmentId: UUID): List<AmendmentChangeDto> =
        jdbc.query(
            """
            SELECT id, article_id, article_number, change_type, note
            FROM amendment_changes
            WHERE amendment_id = ?
            ORDER BY article_number NULLS LAST
            """.trimIndent(),
            { rs, _ ->
                AmendmentChangeDto(
                    id = rs.getObject("id", UUID::class.java),
                    articleId = rs.getObject("article_id", UUID::class.java),
                    articleNumber = rs.getString("article_number"),
                    changeType = rs.getString("change_type"),
                    note = rs.getString("note"),
                )
            },
            amendmentId,
        )
}

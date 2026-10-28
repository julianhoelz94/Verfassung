package com.constitutionatlas.editor.repo

import com.constitutionatlas.editor.api.SourceEvidenceDecisionDto
import com.constitutionatlas.editor.api.SourceEvidenceRevisionDto
import com.constitutionatlas.platform.SourceEvidence
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class SourceEvidenceRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun revisions(session: UUID): List<SourceEvidenceRevisionDto> = jdbc.query(
        "SELECT * FROM source_evidence_revisions WHERE session_id = ? ORDER BY revision DESC",
        { rs, _ ->
            SourceEvidenceRevisionDto(
                rs.getObject("id", UUID::class.java),
                rs.getInt("revision"),
                rs.getString("original")?.let { mapper.readValue(it, SourceEvidence::class.java) },
                mapper.readValue(rs.getString("evidence"), SourceEvidence::class.java),
                rs.getString("reason"),
                rs.getObject("actor_id", UUID::class.java),
                rs.getString("actor_email"),
                rs.getTimestamp("created_at").toInstant(),
            )
        },
        session,
    )

    fun latest(session: UUID): SourceEvidenceRevisionDto? = revisions(session).firstOrNull()

    fun save(session: UUID, revision: Int, original: SourceEvidence?, evidence: SourceEvidence, reason: String, actor: UUID, email: String) {
        jdbc.update(
            "INSERT INTO source_evidence_revisions(id, session_id, revision, original, evidence, reason, actor_id, actor_email) VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)",
            UUID.randomUUID(),
            session,
            revision,
            original?.let(mapper::writeValueAsString),
            mapper.writeValueAsString(evidence),
            reason,
            actor,
            email,
        )
    }

    fun recordDecision(session: UUID, action: String, actor: UUID, email: String, reason: String? = null) {
        val current = latest(session) ?: return
        jdbc.update(
            "INSERT INTO source_evidence_decisions(id, revision_id, action, actor_id, actor_email, reason) VALUES (?, ?, ?, ?, ?, ?)",
            UUID.randomUUID(),
            current.id,
            action,
            actor,
            email,
            reason,
        )
    }

    fun decisions(session: UUID): List<SourceEvidenceDecisionDto> = jdbc.query(
        """SELECT d.*, r.revision FROM source_evidence_decisions d JOIN source_evidence_revisions r ON r.id = d.revision_id
           WHERE r.session_id = ? ORDER BY d.sequence""",
        { rs, _ ->
            SourceEvidenceDecisionDto(
                rs.getObject("id", UUID::class.java),
                rs.getInt("revision"),
                rs.getString("action"),
                rs.getObject("actor_id", UUID::class.java),
                rs.getString("actor_email"),
                rs.getString("reason"),
                rs.getTimestamp("created_at").toInstant(),
            )
        },
        session,
    )
}

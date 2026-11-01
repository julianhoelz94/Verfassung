package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.ChangeRecordChange
import com.constitutionatlas.editor.api.ChangeRecordRequest
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.PublishRequest
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.SourceEvidenceRepository
import com.constitutionatlas.platform.scalarText

/** Reviewed publication details, resolved before source lookup or successor writes. */
internal data class PublicationDetails(val hopKind: String, val comment: String?, val changeRecord: ChangeRecordRequest?)

/** Request/review consistency checks, preserving validation precedence and exact rejection messages. */
internal class EditorPublicationRequest(private val editorRepository: EditorRepository, private val sourceEvidence: SourceEvidenceRepository) {
    /** Resolves saved details and rejects unreviewed publication reason or structured change-record overrides. */
    fun resolve(session: EditSessionDto, request: PublishRequest, structured: Boolean): PublicationDetails {
        val sessionId = session.id
        val hopKind = EditorPublicationRules.normalizeHopKind(request.hopKind)
        if (session.hopKind != null && session.hopKind != hopKind) {
            throw IllegalArgumentException("publish hopKind must match the session job")
        }
        val comment = request.comment ?: editorRepository.publishComment(session.id)
        if (sourceEvidence.latest(sessionId) != null && comment != editorRepository.publishComment(session.id)) {
            throw ConflictException("Save and review the publication reason before publishing", "stale_source_evidence")
        }
        val changeRecord = if (request.amendmentId != null) request.changeRecord else request.changeRecord ?: editorRepository.changeRecord(session.id)
        if (structured && hopKind == "legal" && request.amendmentId == null && request.changeRecord != null && request.changeRecord != editorRepository.changeRecord(session.id)) {
            throw ConflictException("Save and review the change record before publishing", "stale_diff_review")
        }
        requirePayload(request, hopKind, comment, changeRecord)
        requireSelections(request, structured, hopKind, changeRecord)
        return PublicationDetails(hopKind, comment, changeRecord)
    }

    /** Editorial corrections carry only a comment; legal publication supplies exactly one change-record source. */
    private fun requirePayload(request: PublishRequest, hopKind: String, comment: String?, changeRecord: ChangeRecordRequest?) {
        if (hopKind == "editorial_correction") {
            if (request.amendmentId != null || request.changeRecord != null) {
                throw IllegalArgumentException("editorial_correction must not include a change record")
            }
            if (comment.isNullOrBlank()) {
                throw IllegalArgumentException("editorial_correction requires comment")
            }
        } else if ((request.amendmentId == null) == (changeRecord == null)) {
            throw IllegalArgumentException("legal publish requires one change record payload or amendmentId")
        }
        changeRecord?.let(EditorPublicationRules::validateChangeRecord)
    }

    /** Structured legal payloads require exact before/after selections for every reviewed row. */
    private fun requireSelections(request: PublishRequest, structured: Boolean, hopKind: String, changeRecord: ChangeRecordRequest?) {
        if (structured && hopKind == "legal" && request.amendmentId == null && changeRecord?.changes.isNullOrEmpty()) {
            throw IllegalArgumentException("Structured legal publish needs exact before/after unit selections")
        }
        if (structured && hopKind == "legal" && request.amendmentId == null) {
            val changes = requireNotNull(changeRecord).changes
            changes.forEach { change ->
                val validSides = validSides(change)
                if (!validSides) {
                    throw IllegalArgumentException("Structured legal publish needs exact unit selections for every change")
                }
            }
        }
    }

    /** New payload references require logical identities, while pending after-units are allowed. */
    private fun validSides(change: ChangeRecordChange): Boolean = when (change.changeType) {
        "added" -> change.beforeRef == null && (change.afterRef?.logicalId != null || change.pendingAfterLogicalId != null)
        "removed" -> change.beforeRef?.logicalId != null && change.afterRef == null && change.pendingAfterLogicalId == null
        "changed" -> change.beforeRef?.logicalId != null && (change.afterRef?.logicalId != null || change.pendingAfterLogicalId != null)
        else -> false
    }
}

/** Shared pure publication rules used by draft saves and publication without changing transaction ownership. */
internal object EditorPublicationRules {
    /** Mixed child/text content must be preserved through ordered saves and successor writes. */
    fun mixedContent(content: tools.jackson.databind.JsonNode?): Boolean {
        if (content == null || !content.isArray) return false
        val hasText = content.any { it.path("type").scalarText() == "text" }
        val hasChild = content.any { it.path("type").scalarText() == "child" }
        return (hasText && hasChild) || content.any { mixedContent(it.path("node").get("content")) }
    }

    /** Normalizes only the two supported publication jobs. */
    fun normalizeHopKind(raw: String?): String {
        val normalized = raw?.trim()?.lowercase()
        return when (normalized) {
            "legal", "editorial_correction" -> normalized
            else -> throw IllegalArgumentException(
                "hopKind must be legal or editorial_correction",
            )
        }
    }

    /** Legal records require descriptive metadata and a linked document. */
    fun validateChangeRecord(record: ChangeRecordRequest) {
        if (record.title.isBlank() ||
            record.comment.isBlank() ||
            record.documents.isEmpty() ||
            record.documents.any { it.url.isNullOrBlank() && it.fileId.isNullOrBlank() }
        ) {
            throw IllegalArgumentException("Legal change record requires title, comment, and documents")
        }
    }
}

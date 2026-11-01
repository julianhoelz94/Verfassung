package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.ChangeRecordChange
import com.constitutionatlas.editor.api.ChangeRecordRequest
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.PublishRequest
import com.constitutionatlas.editor.client.AmendmentClient
import com.constitutionatlas.editor.client.CatalogVersion
import com.constitutionatlas.editor.client.ContentTreeArticle
import com.constitutionatlas.editor.client.LinkedAmendment
import com.constitutionatlas.editor.client.LinkedAmendmentChange
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.StructuredPublishJobRepository
import java.util.UUID

/** Resolves the legal change record while retaining reviewed links and structured retry receipts. */
internal class EditorPublicationAmendment(private val amendmentClient: AmendmentClient, private val editorRepository: EditorRepository, private val structuredPublishJobs: StructuredPublishJobRepository) {
    /** Recorded receipt wins, followed by an explicitly linked draft, then idempotent record creation. */
    fun resolve(session: EditSessionDto, request: PublishRequest, structured: Boolean, hopKind: String, source: CatalogVersion, changeRecord: ChangeRecordRequest?, changedArticles: List<ContentTreeArticle>, authorization: String?): LinkedAmendment? {
        val recordedAmendment = if (structured) structuredPublishJobs.amendment(session.id) else null
        val amendment = if (hopKind == "legal") {
            recordedAmendment?.let { amendmentClient.getAmendment(it, authorization) ?: throw ConflictException("Reserved change record missing") }
                ?: request.amendmentId?.let { existing(it, source, session, structured, authorization) }
                ?: create(source, session, structured, changeRecord, changedArticles, authorization)
        } else {
            null
        }
        if (structured && amendment != null && recordedAmendment == null) structuredPublishJobs.recordAmendment(session.id, amendment.id)
        return amendment
    }

    /** An existing structured record must contain every reviewed row link and exact unit selections. */
    private fun existing(id: UUID, source: CatalogVersion, session: EditSessionDto, structured: Boolean, authorization: String?): LinkedAmendment = requireAmendmentForHop(id, source.constitutionId, session.versionId, authorization).also { existing ->
        if (structured) {
            editorRepository.changeRecord(session.id)?.changes?.let { reviewedRows ->
                require(reviewedRows.all { row -> row.amendmentChangeId != null && existing.changes.any { it.id == row.amendmentChangeId } }) {
                    "Reviewed rows need exact amendmentChangeId links for an existing change record"
                }
            }
            require(existing.changes.isNotEmpty()) { "Structured legal publish needs exact unit selections on the linked change record" }
            existing.changes.forEach { change ->
                val validSides = validSides(change)
                require(validSides) { "Structured legal publish needs exact unit selections on the linked change record" }
            }
        }
    }

    /** Linked amendment references already identify logical units, so null sides determine selection validity. */
    private fun validSides(change: LinkedAmendmentChange): Boolean = when (change.changeType) {
        "added" -> change.beforeRef == null && (change.afterRef != null || change.pendingAfterLogicalId != null)
        "removed" -> change.beforeRef != null && change.afterRef == null && change.pendingAfterLogicalId == null
        "changed" -> change.beforeRef != null && (change.afterRef != null || change.pendingAfterLogicalId != null)
        else -> false
    }

    /** Legacy records may infer changed article rows; structured payloads retain exactly reviewed selections. */
    private fun create(source: CatalogVersion, session: EditSessionDto, structured: Boolean, changeRecord: ChangeRecordRequest?, changedArticles: List<ContentTreeArticle>, authorization: String?): LinkedAmendment = amendmentClient.createAmendment(
        source.constitutionId,
        changeRecord!!.copy(
            publishAttemptId = if (structured) session.id else null,
            sourceVersionId = session.versionId,
            changes = if (structured) {
                changeRecord.changes
            } else {
                changeRecord.changes.ifEmpty {
                    changedArticles.map { ChangeRecordChange(it.id, it.articleNumber) }
                }
            },
        ),
        authorization,
    )

    /** Existing change records must be unlinked drafts belonging to this constitution and source. */
    private fun requireAmendmentForHop(
        amendmentId: UUID,
        constitutionId: UUID,
        sourceVersionId: UUID,
        authorization: String?,
    ): LinkedAmendment {
        val amendment = amendmentClient.getAmendment(amendmentId, authorization)
            ?: throw IllegalArgumentException("Unknown amendment '$amendmentId'")
        if (amendment.constitutionId != constitutionId) {
            throw IllegalArgumentException("Amendment belongs to a different constitution")
        }
        if (amendment.status !in setOf("draft", "published")) {
            throw IllegalArgumentException("Amendment status must be draft or published")
        }
        if (amendment.status != "draft" ||
            amendment.targetVersionId != null ||
            (amendment.sourceVersionId != null && amendment.sourceVersionId != sourceVersionId)
        ) {
            throw IllegalArgumentException("Change record must be an unlinked draft for this source version")
        }
        if (amendment.title.isBlank() ||
            amendment.comment.isBlank() ||
            amendment.documents.isEmpty() ||
            amendment.documents.any { it.url.isNullOrBlank() && it.fileId.isNullOrBlank() }
        ) {
            throw IllegalArgumentException("Legal change record requires title, comment, and documents")
        }
        return amendment
    }
}

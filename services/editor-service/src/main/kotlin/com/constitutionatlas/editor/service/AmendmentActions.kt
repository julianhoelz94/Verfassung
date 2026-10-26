package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.client.AmendmentClient
import com.constitutionatlas.editor.client.AmendmentDiffDecisionRequest
import com.constitutionatlas.editor.client.LinkedAmendmentChange
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.StructuredDiffReviewRepository
import com.constitutionatlas.platform.DiffItem
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class AmendmentActions(private val amendmentClient: AmendmentClient, private val sessions: EditorRepository, private val reviews: StructuredDiffReviewRepository) {
    fun completeLink(amendmentId: UUID, sourceVersionId: UUID, targetVersionId: UUID, authorization: String?, sessionId: UUID? = null) {
        val record = amendmentClient.getAmendment(amendmentId, authorization)
            ?: throw DownstreamException("change record missing after version publish")
        if (record.status == "published") {
            if (record.targetVersionId == targetVersionId) return
            throw DownstreamException("published change record points to another target version")
        }
        if (record.targetVersionId != targetVersionId) {
            amendmentClient.linkTarget(amendmentId, sourceVersionId, targetVersionId, authorization)
        }
        if (sessionId != null && reviews.pin(sessionId) != null) transferReview(sessionId, amendmentId, authorization)
        if (record.status != "published" || record.targetVersionId != targetVersionId) {
            amendmentClient.publishAmendment(amendmentId, authorization)
        }
    }

    private fun transferReview(sessionId: UUID, amendmentId: UUID, authorization: String?) {
        val snapshot = amendmentClient.diffReview(amendmentId, authorization) ?: return
        val editorRun = reviews.candidates(sessionId)
        val decisions = reviews.decisions(sessionId).associateBy { it.key }
        val editorRows = sessions.changeRecord(sessionId)?.changes.orEmpty().mapNotNull { row -> row.id?.let { it to row } }.toMap()
        val amendmentRows = amendmentClient.getAmendment(amendmentId, authorization)?.changes.orEmpty()
        fun signature(item: DiffItem): String = "${item.facet}|${item.beforeRefs.map { it.logicalId }.sorted()}|${item.afterRefs.map { it.logicalId }.sorted()}"
        val editorCandidates = editorRun.associateBy(::signature)
        for (candidate in snapshot.candidates) {
            val editorCandidate = editorCandidates[signature(candidate)] ?: continue
            val decision = decisions[editorCandidate.key] ?: continue
            if (decision.status != "linked" && decision.status != "excluded_with_reason") continue
            val mapped = decision.linkedRowIds.map { id ->
                val original = editorRows[id] ?: throw DownstreamException("Reviewed change row is missing")
                amendmentRows.singleOrNull { row -> row.sourceChangeId == (original.amendmentChangeId ?: id) || (original.amendmentChangeId != null && row.id == original.amendmentChangeId) }?.id
                    ?: amendmentRows.singleOrNull { row -> matches(original.beforeRef?.logicalId, original.afterRef?.logicalId ?: original.pendingAfterLogicalId, row) }?.id
                    ?: throw DownstreamException("Reviewed change row has no unique published mapping")
            }
            amendmentClient.decideDiff(amendmentId, AmendmentDiffDecisionRequest(snapshot.revisionId, candidate.key, candidate.fingerprint, decision.status, mapped, decision.reason, decision.reviewerAcknowledged), authorization)
        }
    }

    private fun matches(before: UUID?, after: UUID?, row: LinkedAmendmentChange): Boolean =
        before == row.beforeRef?.logicalId && after == (row.afterRef?.logicalId ?: row.pendingAfterLogicalId)

    fun refresh(constitutionId: UUID, legalVersionId: UUID, authorization: String?) {
        amendmentClient.refreshReviewStatus(constitutionId, legalVersionId, authorization)
    }
}

package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.client.toAmendmentRef
import java.util.UUID

/** Projects target-link changes inside the service transaction without changing resolution phases. */
internal class AmendmentLinkedChanges(private val content: ContentClient) {
    /** Exact selections are re-resolved per row; legacy records compare source then target snapshots. */
    fun link(tip: AmendmentDto, sourceVersionId: UUID?, targetVersionId: UUID): List<AmendmentChangeWriteRequest> {
        if (tip.changes.any(::hasExactSelection)) return exact(tip, sourceVersionId, targetVersionId)
        val sourceTree = sourceVersionId?.let(content::listArticles).orEmpty()
        val targetTree = content.listArticles(targetVersionId)
        val diffs = AmendmentDiff.diff(AmendmentDiff.flatten(sourceTree), AmendmentDiff.flatten(targetTree))
        if (diffs.any { it.ambiguous }) throw ConflictException("Change selection is ambiguous; choose the exact constitutional units before publishing", "ambiguous_unit_pairing")
        if (diffs.isEmpty()) return tip.changes.map(AmendmentChangeProjection::historical)
        return diffs.map { change ->
            val previous = tip.changes.firstOrNull { row -> row.articleNumber == change.node.articleNumber && row.changeType == change.type }
            AmendmentChangeProjection.linked(change, previous, sourceVersionId, targetVersionId)
        }
    }

    /** Rejects mixed exact and legacy rows before the first downstream request. */
    private fun exact(tip: AmendmentDto, sourceVersionId: UUID?, targetVersionId: UUID): List<AmendmentChangeWriteRequest> {
        require(tip.changes.all(::hasExactSelection)) { "Every change needs an exact unit selection when this record uses exact links" }
        return tip.changes.map { change ->
            AmendmentChangeProjection.historical(change).copy(
                beforeRef = if (change.changeType == "added") null else reResolve(change.beforeRef, sourceVersionId),
                afterRef = if (change.changeType == "removed") null else reResolve(change.afterRef ?: change.pendingAfterLogicalId?.let { AmendmentUnitRefDto(logicalId = it) }, targetVersionId),
                pendingAfterLogicalId = null,
                linkReviewReason = change.linkReviewReason,
            )
        }
    }

    /** Exactness includes a pending draft identity even before a published after-reference exists. */
    private fun hasExactSelection(change: AmendmentChangeDto): Boolean = change.beforeRef != null || change.afterRef != null || change.pendingAfterLogicalId != null

    /** Re-resolves only supplied sides, preserving missing-logical and missing-snapshot diagnostics. */
    private fun reResolve(ref: AmendmentUnitRefDto?, versionId: UUID?): AmendmentUnitRefDto? {
        if (ref == null || versionId == null) return null
        val logicalId = ref.logicalId ?: throw IllegalArgumentException("Exact change selection has no logical unit")
        return content.resolve(versionId, logicalId)?.toAmendmentRef()
            ?: throw IllegalArgumentException("Selected unit is missing from the published snapshot")
    }
}

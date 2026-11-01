package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import java.util.UUID

/** Shared display/write projections retain historical metadata and exact snapshot link formats. */
internal object AmendmentChangeProjection {
    /** Uses the original number, label, then kind fallback without changing authored text. */
    fun noteFor(change: NodeChange): String {
        val label = change.node.number ?: change.node.label ?: change.node.kind
        return when (change.type) {
            "added" -> "Added $label"
            "removed" -> "Removed $label"
            else -> "Title or body changed on $label"
        }
    }

    /** Legacy units without immutable logical and revision pins cannot produce an exact reference. */
    fun toRef(versionId: UUID, node: FlatNode): AmendmentUnitRefDto? {
        val logicalId = node.logicalId ?: return null
        val revisionId = node.revisionId ?: return null
        return AmendmentUnitRefDto(
            versionId = versionId,
            logicalId = logicalId,
            occurrenceId = node.id,
            rootOccurrenceId = node.articleId,
            revisionId = revisionId,
            unitKind = if (node.kind == "parent_text") "text_entry" else "node",
            kind = node.kind,
            label = node.number ?: node.label ?: node.kind,
            text = node.body,
            deepLink = "/versions/$versionId/units/${node.articleId}?occurrenceId=${node.id}",
        )
    }

    /** A no-diff legacy relink preserves metadata and source ancestry without inventing exact links. */
    fun historical(change: AmendmentChangeDto): AmendmentChangeWriteRequest = AmendmentChangeWriteRequest(
        sourceChangeId = change.id,
        articleNumber = change.articleNumber,
        changeType = change.changeType,
        note = change.note,
        articleId = change.articleId,
        nodeId = change.nodeId,
        changedOn = change.changedOn,
        effectiveOn = change.effectiveOn,
        amendingLawTitle = change.amendingLawTitle,
        amendingLawCitation = change.amendingLawCitation,
    )

    /** First matching historical row supplies editorial metadata; new changes use the original note. */
    fun linked(change: NodeChange, previous: AmendmentChangeDto?, sourceVersionId: UUID?, targetVersionId: UUID): AmendmentChangeWriteRequest = AmendmentChangeWriteRequest(
        articleNumber = change.node.articleNumber,
        changeType = change.type,
        note = previous?.note ?: noteFor(change),
        articleId = change.node.articleId,
        nodeId = change.node.id,
        changedOn = previous?.changedOn,
        effectiveOn = previous?.effectiveOn,
        amendingLawTitle = previous?.amendingLawTitle,
        amendingLawCitation = previous?.amendingLawCitation,
        beforeRef = change.before?.let { toRef(requireNotNull(sourceVersionId), it) },
        afterRef = if (change.type == "removed") null else toRef(targetVersionId, change.node),
    )
}

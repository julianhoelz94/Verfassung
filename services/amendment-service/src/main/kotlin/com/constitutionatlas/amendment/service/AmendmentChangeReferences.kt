package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.amendment.client.ContentClient
import java.util.UUID

/** Validates exact links within the caller's transaction, preserving row and before/after order. */
internal class AmendmentChangeReferences(private val content: ContentClient) {
    /** Duplicate namespaces belong to one request, never to the service instance or another write. */
    fun validate(
        constitutionId: UUID,
        sourceVersionId: UUID?,
        targetVersionId: UUID?,
        changes: List<AmendmentChangeWriteRequest>,
        allowDraftTarget: Boolean,
    ): List<AmendmentChangeWriteRequest> {
        val resolver = AmendmentReferenceResolver(content, constitutionId, allowDraftTarget)
        val selected = SelectedChangeReferences()
        return changes.map { normalize(it, sourceVersionId, targetVersionId, resolver, selected) }
    }

    /** Resolves both sides before shape, duplicate and article guards, then replaces untrusted quotes. */
    private fun normalize(
        change: AmendmentChangeWriteRequest,
        sourceVersionId: UUID?,
        targetVersionId: UUID?,
        resolver: AmendmentReferenceResolver,
        selected: SelectedChangeReferences,
    ): AmendmentChangeWriteRequest {
        val requestedAfter = change.afterRef ?: change.pendingAfterLogicalId?.let { AmendmentUnitRefDto(logicalId = it) }
        val hasRefs = change.beforeRef != null || requestedAfter != null
        if (!hasRefs) return change
        val before = resolver.resolve(change.beforeRef, sourceVersionId, "Before")
        val after = resolver.resolve(requestedAfter, targetVersionId, "After")
        validateShape(change, before, after)
        selected.record(before, after)
        validateArticle(before, after)
        return change.copy(
            articleNumber = before?.articleNumber ?: after?.articleNumber ?: change.articleNumber,
            beforeRef = before,
            afterRef = after?.takeIf { it.versionId != null },
            pendingAfterLogicalId = after?.takeIf { it.versionId == null }?.logicalId ?: change.pendingAfterLogicalId,
            linkReviewReason = change.linkReviewReason?.trim()?.ifBlank { null },
        )
    }

    /** Type-specific side requirements run before request-wide duplicate selection checks. */
    private fun validateShape(change: AmendmentChangeWriteRequest, before: AmendmentUnitRefDto?, after: AmendmentUnitRefDto?) {
        when (change.changeType) {
            "changed" -> {
                require(before != null && after != null) { "Changed units need both before and after references" }
                if (before.logicalId != after.logicalId && change.linkReviewReason.isNullOrBlank()) {
                    throw IllegalArgumentException("A changed unit with different logical identities needs a review reason")
                }
            }
            "added" -> require(before == null && after != null) { "Added units need an after reference only" }
            "removed" -> require(before != null && after == null) { "Removed units need a before reference only" }
            else -> throw IllegalArgumentException("Unsupported change type")
        }
    }

    /** Missing article projections remain compatible; two supplied projections must agree. */
    private fun validateArticle(before: AmendmentUnitRefDto?, after: AmendmentUnitRefDto?) {
        if ((before?.articleNumber != null && after?.articleNumber != null) && before.articleNumber != after.articleNumber) {
            throw IllegalArgumentException("Before and after units must belong to the same article")
        }
    }
}

/** Tracks before, published-after and draft-after identities in distinct request-local namespaces. */
private class SelectedChangeReferences {
    private val before = mutableSetOf<Pair<UUID, UUID>>()
    private val after = mutableSetOf<Pair<UUID, UUID>>()
    private val draftTargets = mutableSetOf<UUID>()

    /** Before duplicates win over after duplicates, which in turn precede article compatibility. */
    fun record(beforeRef: AmendmentUnitRefDto?, afterRef: AmendmentUnitRefDto?) {
        beforeRef?.let { if (!before.add(it.versionId!! to it.occurrenceId!!)) throw IllegalArgumentException("Duplicate before reference") }
        afterRef?.let {
            if (it.versionId == null) {
                if (!draftTargets.add(it.logicalId!!)) throw IllegalArgumentException("Duplicate draft after reference")
            } else if (!after.add(it.versionId to it.occurrenceId!!)) {
                throw IllegalArgumentException("Duplicate after reference")
            }
        }
    }
}

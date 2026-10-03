package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.ChangeRecordChange
import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.StructuredDraftPreview
import com.constitutionatlas.editor.client.StructuredSourceClient
import com.constitutionatlas.editor.repo.DiffDecisionRow
import com.constitutionatlas.editor.repo.DiffReviewPin
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.StructuredDiffReviewRepository
import com.constitutionatlas.editor.repo.StructuredDraftRepository
import com.constitutionatlas.platform.DiffEntry
import com.constitutionatlas.platform.DiffItem
import com.constitutionatlas.platform.DiffNode
import com.constitutionatlas.platform.HierarchicalDiff
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

data class DiffReviewDecisionWrite(
    val expectedGeneration: Long,
    val key: String,
    val fingerprint: String,
    val status: String,
    val linkedRowIds: List<UUID> = emptyList(),
    val exclusionReason: String? = null,
    val reviewerAcknowledged: Boolean = false,
)

data class DiffReviewState(
    val sourceVersionId: UUID,
    val sourceGeneration: Long,
    val settingsRevisionId: UUID,
    val draftGeneration: Long,
    val algorithmVersion: String,
    val candidates: List<DiffItem>,
    val decisions: List<DiffDecisionRow>,
    val totals: Map<String, Int>,
    val currentPosition: Int?,
)

@Service
class StructuredDiffReviewService(private val sources: StructuredSourceClient, private val repository: StructuredDiffReviewRepository, private val sessions: EditorRepository, private val drafts: StructuredDraftRepository) {
    @Transactional
    fun refresh(preview: StructuredDraftPreview): DiffReviewState {
        drafts.lockSession(preview.sessionId)
        if ((drafts.pin(preview.sessionId)?.generation ?: 0) != preview.generation) throw ConflictException("Stale draft generation", "stale_draft")
        val source = sources.source(preview.sourceVersionId)
        if (source.generation != preview.sourceGeneration || source.settingsRevisionId != preview.settingsRevisionId || source.roots.map { it.revisionId } != preview.sourceRootRevisionIds) {
            throw ConflictException("Pinned source changed", "stale_source")
        }
        val pin = DiffReviewPin(preview.sourceVersionId, preview.sourceGeneration, preview.settingsRevisionId, preview.generation, HierarchicalDiff.ALGORITHM_VERSION)
        val prior = repository.pin(preview.sessionId)
        if (prior != null && (prior.sourceVersionId != pin.sourceVersionId || prior.sourceGeneration != pin.sourceGeneration || prior.settingsRevisionId != pin.settingsRevisionId)) {
            throw ConflictException("Diff review source pin changed", "stale_source")
        }
        val ancestry = textAncestry(source.roots, preview.operations)
        val items = HierarchicalDiff.compare(preview.sourceVersionId, source.roots.map { asDiffNode(it, emptyMap()) }, null, preview.roots.map { asDiffNode(it, ancestry) }, skipSharedRevision = false).items
        repository.saveRun(preview.sessionId, pin, items)
        val previous = repository.decisions(preview.sessionId).associateBy { it.key }
        val activeKeys = items.map { it.key }.toSet()
        previous.keys.filter { it !in activeKeys }.forEach { repository.deleteDecision(preview.sessionId, it) }
        for (item in items) {
            val decision = previous[item.key]
            if (decision == null) {
                repository.saveDecision(preview.sessionId, DiffDecisionRow(item.key, item.fingerprint, "open", emptyList(), null, false))
            } else if (decision.fingerprint != item.fingerprint || prior?.algorithmVersion != pin.algorithmVersion) {
                repository.markRecheck(preview.sessionId, item.key, item.fingerprint)
            }
        }
        return state(pin, items, repository.decisions(preview.sessionId))
    }

    @Transactional
    fun decide(preview: StructuredDraftPreview, write: DiffReviewDecisionWrite, reviewer: Boolean): DiffReviewState {
        val current = refresh(preview)
        if (write.expectedGeneration != current.draftGeneration) throw ConflictException("Stale draft generation", "stale_draft")
        val item = current.candidates.singleOrNull { it.key == write.key && it.fingerprint == write.fingerprint }
            ?: throw ConflictException("Candidate changed; refresh the review", "stale_candidate")
        require(write.status == "linked" || write.status == "excluded_with_reason") { "Decision must link rows or give an exclusion reason" }
        if (write.status == "linked") require(write.linkedRowIds.isNotEmpty()) { "Linked decision requires amendment rows" }
        if (write.status == "excluded_with_reason") require(!write.exclusionReason.isNullOrBlank()) { "Exclusion needs a reason" }
        if (write.reviewerAcknowledged && !reviewer) throw com.constitutionatlas.platform.ForbiddenException("Reviewer role required to acknowledge an exclusion")
        if (write.status == "linked") validateRows(preview.sessionId, item, write.linkedRowIds)
        if (item.ambiguous && write.status == "linked") require(write.linkedRowIds.size > 1) { "Ambiguous group needs multiple linked rows" }
        repository.saveDecision(preview.sessionId, DiffDecisionRow(write.key, write.fingerprint, write.status, write.linkedRowIds.distinct(), write.exclusionReason?.trim(), write.reviewerAcknowledged))
        return state(DiffReviewPin(current.sourceVersionId, current.sourceGeneration, current.settingsRevisionId, current.draftGeneration, current.algorithmVersion), current.candidates, repository.decisions(preview.sessionId))
    }

    @Transactional
    fun requireComplete(preview: StructuredDraftPreview) {
        val current = refresh(preview)
        val decisions = current.decisions.associateBy { it.key }
        current.candidates.forEach { item ->
            decisions[item.key]?.takeIf { it.status == "linked" }?.let { validateRows(preview.sessionId, item, it.linkedRowIds) }
        }
        if (current.candidates.any { item ->
                decisions[item.key]?.let { it.status == "open" || it.status == "needs_recheck" || (it.status == "excluded_with_reason" && !it.reviewerAcknowledged) || (item.ambiguous && it.status == "linked" && (!it.reviewerAcknowledged || it.linkedRowIds.size < 2)) } != false
            }
        ) {
            throw ConflictException("Diff review has open, ambiguous, or unacknowledged findings", "diff_review_incomplete")
        }
    }

    /** An editor may submit reasoned exclusions so a separate reviewer can acknowledge them. */
    @Transactional
    fun requireReadyForReview(preview: StructuredDraftPreview) {
        val current = refresh(preview)
        val decisions = current.decisions.associateBy { it.key }
        current.candidates.forEach { item ->
            decisions[item.key]?.takeIf { it.status == "linked" }?.let { validateRows(preview.sessionId, item, it.linkedRowIds) }
        }
        if (current.candidates.any { item ->
                val decision = decisions[item.key]
                decision == null ||
                    decision.status == "open" ||
                    decision.status == "needs_recheck" ||
                    (decision.status == "excluded_with_reason" && decision.reason.isNullOrBlank()) ||
                    (item.ambiguous && decision.status == "linked" && decision.linkedRowIds.size < 2)
            }
        ) {
            throw ConflictException("Diff review has open, ambiguous, or stale findings", "diff_review_incomplete")
        }
    }

    /** A saved change row may retain its ID while its exact unit pairing changes. */
    @Transactional
    fun recheckInvalidLinks(sessionId: UUID) {
        val candidates = repository.candidates(sessionId).associateBy { it.key }
        repository.decisions(sessionId).filter { it.status == "linked" }.forEach { decision ->
            val candidate = candidates[decision.key] ?: return@forEach
            try {
                validateRows(sessionId, candidate, decision.linkedRowIds)
            } catch (_: IllegalArgumentException) {
                repository.markRecheck(sessionId, decision.key, candidate.fingerprint)
            }
        }
    }

    private fun validateRows(sessionId: UUID, item: DiffItem, ids: List<UUID>) {
        val rows = sessions.changeRecord(sessionId)?.changes.orEmpty().mapNotNull { row -> row.id?.let { it to row } }.toMap()
        require(ids.isNotEmpty() && ids.all { it in rows }) { "Linked amendment rows must belong to the saved change record" }
        val selected = ids.map { rows.getValue(it) }
        val before = selected.mapNotNull(ChangeRecordChange::beforeRef).map { it.logicalId }.toSet()
        val after = selected.mapNotNull { it.afterRef?.logicalId ?: it.pendingAfterLogicalId }.toSet()
        require(before.containsAll(item.beforeRefs.map { it.logicalId }) && after.containsAll(item.afterRefs.map { it.logicalId })) {
            "Linked amendment rows must cover the candidate's exact units"
        }
    }

    private fun state(pin: DiffReviewPin, items: List<DiffItem>, decisions: List<DiffDecisionRow>): DiffReviewState {
        val byKey = decisions.associateBy { it.key }
        fun resolved(item: DiffItem): Boolean {
            val decision = byKey[item.key] ?: return false
            return (decision.status == "linked" && (!item.ambiguous || (decision.reviewerAcknowledged && decision.linkedRowIds.size > 1))) ||
                (decision.status == "excluded_with_reason" && decision.reviewerAcknowledged)
        }
        val levels = items.groupBy { it.level }.flatMap { (level, candidates) ->
            listOf("level:$level:total" to candidates.size, "level:$level:resolved" to candidates.count(::resolved))
        }.toMap()
        return DiffReviewState(
            pin.sourceVersionId, pin.sourceGeneration, pin.settingsRevisionId, pin.draftGeneration, pin.algorithmVersion, items, decisions,
            levels + mapOf("total" to items.size, "resolved" to items.count(::resolved)),
            items.indexOfFirst { !resolved(it) }.takeIf { it >= 0 }?.plus(1),
        )
    }

    private fun textAncestry(roots: List<DraftNode>, operations: List<com.constitutionatlas.editor.api.DraftOperation>): Map<UUID, List<UUID>> {
        val ancestry = mutableMapOf<UUID, List<UUID>>()
        fun visit(node: DraftNode) {
            node.content.forEach { entry ->
                if (entry.node != null) {
                    visit(entry.node)
                } else if (entry.logicalId != null && entry.revisionId != null) {
                    ancestry[entry.logicalId] = listOf(entry.revisionId)
                }
            }
        }
        roots.forEach(::visit)
        operations.forEach { operation ->
            when (operation.type) {
                "split_text" -> operation.parts.forEach { ancestry[it.logicalId] = ancestry[operation.targetId].orEmpty() }
                "merge_text" -> operation.parts.firstOrNull()?.let { part -> ancestry[part.logicalId] = operation.mergeIds.flatMap { ancestry[it].orEmpty() }.distinct() }
            }
        }
        return ancestry
    }

    private fun asDiffNode(node: DraftNode, ancestry: Map<UUID, List<UUID>>): DiffNode = DiffNode(node.logicalId, node.revisionId, node.occurrenceId ?: node.draftId, node.kind, node.label, node.title, node.content.map { asDiffEntry(it, ancestry) })
    private fun asDiffEntry(entry: DraftEntry, ancestry: Map<UUID, List<UUID>>): DiffEntry = when (entry.type) {
        "child" -> DiffEntry.Child(asDiffNode(requireNotNull(entry.node), ancestry))
        "text" -> DiffEntry.Text(requireNotNull(entry.logicalId ?: entry.draftId), entry.revisionId, entry.occurrenceId ?: entry.draftId, requireNotNull(entry.text), entry.logicalId?.let { ancestry[it] }.orEmpty())
        else -> throw IllegalArgumentException("Unknown draft entry type '${entry.type}'")
    }
}

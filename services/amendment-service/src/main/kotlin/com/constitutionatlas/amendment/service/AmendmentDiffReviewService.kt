package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.repo.AmendmentDiffDecision
import com.constitutionatlas.amendment.repo.AmendmentDiffPin
import com.constitutionatlas.amendment.repo.AmendmentDiffReviewRepository
import com.constitutionatlas.amendment.repo.AmendmentRepository
import com.constitutionatlas.platform.DiffItem
import com.constitutionatlas.platform.HierarchicalDiff
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

data class AmendmentDiffDecisionWrite(
    val expectedRevisionId: UUID,
    val key: String,
    val fingerprint: String,
    val status: String,
    val linkedChangeIds: List<UUID> = emptyList(),
    val exclusionReason: String? = null,
    val reviewerAcknowledged: Boolean = false,
)

data class AmendmentDiffReviewState(
    val revisionId: UUID,
    val sourceVersionId: UUID,
    val targetVersionId: UUID,
    val algorithmVersion: String,
    val candidates: List<DiffItem>,
    val decisions: List<AmendmentDiffDecision>,
    val totals: Map<String, Int>,
    val currentPosition: Int?,
)

@Service
class AmendmentDiffReviewService(
    private val amendments: AmendmentRepository,
    private val content: ContentClient,
    private val catalog: CatalogClient,
    private val repository: AmendmentDiffReviewRepository,
) {
    @Transactional
    fun refresh(amendmentId: UUID): AmendmentDiffReviewState {
        amendments.lockAmendment(amendmentId)
        val (revisionId, tip) = tip(amendmentId)
        val sourceId = tip.sourceVersionId ?: throw ConflictException("Diff review needs a source snapshot", "missing_source_pin")
        val targetId = tip.targetVersionId ?: throw ConflictException("Diff review needs a target snapshot", "missing_target_pin")
        listOf(sourceId, targetId).forEach { id ->
            val version = catalog.getVersion(id)
            if (version?.publicationStatus != null && version.publicationStatus != "published") throw ConflictException("Diff review requires published snapshots", "unpublished_snapshot")
        }
        val pin = AmendmentDiffPin(sourceId, targetId, HierarchicalDiff.ALGORITHM_VERSION)
        val oldPin = repository.pin(revisionId)
        if (oldPin != null && (oldPin.sourceVersionId != pin.sourceVersionId || oldPin.targetVersionId != pin.targetVersionId)) throw ConflictException("Diff review pins changed", "stale_diff_review")
        val items = AmendmentDiff.hierarchical(sourceId, content.listArticles(sourceId), targetId, content.listArticles(targetId), content.settingsRevisionId(sourceId), content.settingsRevisionId(targetId)).items
        repository.saveRun(revisionId, pin, items)
        val previous = repository.decisions(revisionId).associateBy { it.key }
        val keys = items.map { it.key }.toSet()
        previous.keys.filter { it !in keys }.forEach { repository.delete(revisionId, it) }
        for (item in items) {
            val decision = previous[item.key]
            if (decision == null) {
                repository.saveDecision(revisionId, AmendmentDiffDecision(item.key, item.fingerprint, "open", emptyList(), null, false))
            } else if (decision.fingerprint != item.fingerprint || oldPin?.algorithmVersion != pin.algorithmVersion) {
                repository.markRecheck(revisionId, item.key, item.fingerprint)
            }
        }
        return state(revisionId, pin, items, repository.decisions(revisionId))
    }

    @Transactional
    fun decide(amendmentId: UUID, request: AmendmentDiffDecisionWrite, reviewer: Boolean): AmendmentDiffReviewState {
        val current = refresh(amendmentId)
        if (request.expectedRevisionId != current.revisionId) throw ConflictException("Amendment revision changed", "stale_revision")
        val item = current.candidates.singleOrNull { it.key == request.key && it.fingerprint == request.fingerprint }
            ?: throw ConflictException("Diff candidate changed", "stale_candidate")
        require(request.status == "linked" || request.status == "excluded_with_reason") { "Decision must link changes or give an exclusion reason" }
        if (request.status == "linked") require(request.linkedChangeIds.isNotEmpty()) { "Linked decision needs change rows" }
        if (request.status == "excluded_with_reason") require(!request.exclusionReason.isNullOrBlank()) { "Exclusion needs a reason" }
        if (request.reviewerAcknowledged && !reviewer) throw com.constitutionatlas.platform.ForbiddenException("Reviewer role required")
        val tip = amendments.getAmendmentDtoForRevision(amendmentId, current.revisionId, includeStaff = true) ?: throw NotFoundException("amendment not found")
        val rows = tip.changes.associateBy { it.id }
        require(request.linkedChangeIds.all { it in rows }) { "Linked row does not belong to this revision" }
        if (request.status == "linked") validateRows(item, request.linkedChangeIds.map { rows.getValue(it) })
        repository.saveDecision(current.revisionId, AmendmentDiffDecision(request.key, request.fingerprint, request.status, request.linkedChangeIds.distinct(), request.exclusionReason?.trim(), request.reviewerAcknowledged))
        return state(current.revisionId, AmendmentDiffPin(current.sourceVersionId, current.targetVersionId, current.algorithmVersion), current.candidates, repository.decisions(current.revisionId))
    }

    @Transactional
    fun requireComplete(amendmentId: UUID) {
        val current = refresh(amendmentId)
        listOf(current.sourceVersionId, current.targetVersionId).forEach { id ->
            val tip = catalog.getVersion(id)?.currentVersionId
            if (tip != null && tip != id) throw ConflictException("Reviewed editorial tip changed", "stale_snapshot_pin")
        }
        val decisions = current.decisions.associateBy { it.key }
        if (current.candidates.any { item ->
                val decision = decisions[item.key]
                decision == null || decision.status == "open" || decision.status == "needs_recheck" ||
                    (decision.status == "excluded_with_reason" && !decision.reviewerAcknowledged) ||
                    (item.ambiguous && decision.status == "linked" && (decision.linkedChangeIds.size < 2 || !decision.reviewerAcknowledged))
            }
        ) {
            throw ConflictException("Snapshot diff review is incomplete", "diff_review_incomplete")
        }
    }

    private fun tip(amendmentId: UUID): Pair<UUID, AmendmentDto> {
        val revisionId = amendments.findTipRevisionId(amendmentId) ?: throw NotFoundException("amendment not found")
        val dto = amendments.getAmendmentDtoForRevision(amendmentId, revisionId, includeStaff = true) ?: throw NotFoundException("amendment not found")
        if (dto.status != "draft" && (dto.status != "published" || dto.publishedRevisionId == revisionId)) throw ConflictException("Only a draft revision can change diff decisions", "not_draft")
        return revisionId to dto
    }

    private fun validateRows(item: DiffItem, rows: List<com.constitutionatlas.amendment.api.AmendmentChangeDto>) {
        val before = item.beforeRefs.map { it.logicalId }.toSet()
        val after = item.afterRefs.map { it.logicalId }.toSet()
        val selectedBefore = rows.mapNotNull { it.beforeRef?.logicalId }.toSet()
        val selectedAfter = rows.mapNotNull { it.afterRef?.logicalId }.toSet()
        require(selectedBefore.containsAll(before) && selectedAfter.containsAll(after)) { "Linked rows must select the candidate's exact source and target units" }
    }

    private fun state(revisionId: UUID, pin: AmendmentDiffPin, items: List<DiffItem>, decisions: List<AmendmentDiffDecision>): AmendmentDiffReviewState {
        val byKey = decisions.associateBy { it.key }
        fun resolved(item: DiffItem): Boolean {
            val decision = byKey[item.key] ?: return false
            return (decision.status == "linked" && (!item.ambiguous || (decision.reviewerAcknowledged && decision.linkedChangeIds.size > 1))) ||
                (decision.status == "excluded_with_reason" && decision.reviewerAcknowledged)
        }
        val levels = items.groupBy { it.level }.flatMap { (level, candidates) ->
            listOf("level:$level:total" to candidates.size, "level:$level:resolved" to candidates.count(::resolved))
        }.toMap()
        return AmendmentDiffReviewState(
            revisionId,
            pin.sourceVersionId,
            pin.targetVersionId,
            pin.algorithmVersion,
            items,
            decisions,
            levels + mapOf("total" to items.size, "resolved" to items.count(::resolved)),
            items.indexOfFirst { !resolved(it) }.takeIf { it >= 0 }?.plus(1),
        )
    }
}

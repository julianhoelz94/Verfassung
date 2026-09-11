package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentRevisionDto
import com.constitutionatlas.amendment.api.AmendmentWriteRequest
import com.constitutionatlas.amendment.api.LinkTargetRequest
import com.constitutionatlas.amendment.api.SuggestRequest
import com.constitutionatlas.amendment.api.SuggestResponse
import com.constitutionatlas.amendment.api.SuggestedChangeDto
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.repo.AmendmentRepository
import com.constitutionatlas.amendment.repo.DraftAmendmentInsert
import com.constitutionatlas.amendment.repo.RevisionInsert
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.NotFoundException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private val ALLOWED_KINDS = setOf("legal_amendment", "official_errata")
private val ALLOWED_CHANGE_TYPES = setOf("added", "changed", "removed")

@Service
class AmendmentService(
    private val amendmentRepository: AmendmentRepository,
    private val contentClient: ContentClient,
) {
    fun listForVersion(versionId: UUID, sourceVersionId: UUID?): List<AmendmentDto> =
        amendmentRepository.listForTargetVersion(versionId, sourceVersionId)

    fun listForConstitution(constitutionId: UUID): List<AmendmentDto> =
        amendmentRepository.listPublishedForConstitution(constitutionId)

    fun listStaffForConstitution(constitutionId: UUID): List<AmendmentDto> =
        amendmentRepository.listStaffForConstitution(constitutionId)

    fun getPublishedAmendment(id: UUID): AmendmentDto =
        amendmentRepository.getPublishedAmendment(id)
            ?: throw NotFoundException("amendment not found")

    fun getStaffAmendment(id: UUID): AmendmentDto {
        val tipRevisionId =
            amendmentRepository.findTipRevisionId(id)
                ?: throw NotFoundException("amendment not found")
        return amendmentRepository.getAmendmentDtoForRevision(id, tipRevisionId)
            ?: throw NotFoundException("amendment not found")
    }

    fun listForArticle(constitutionId: UUID, articleNumber: String): List<AmendmentDto> =
        amendmentRepository.listForArticle(constitutionId, articleNumber)

    fun listRevisions(amendmentId: UUID): List<AmendmentRevisionDto> {
        if (!amendmentRepository.amendmentExists(amendmentId)) {
            throw NotFoundException("amendment not found")
        }
        return amendmentRepository.listRevisions(amendmentId)
    }

    @Transactional
    fun createAmendment(constitutionId: UUID, request: AmendmentWriteRequest, actor: Actor): AmendmentDto {
        val kind = requireKind(request.kind)
        validateChanges(request.changes.map { it.changeType })
        val amendmentId = UUID.randomUUID()
        val revisionId = UUID.randomUUID()
        amendmentRepository.insertDraftAmendment(
            DraftAmendmentInsert(
                id = amendmentId,
                constitutionId = constitutionId,
                kind = kind,
                title = request.title.trim(),
                summary = request.summary?.trim()?.ifBlank { null } ?: "",
            ),
        )
        amendmentRepository.insertRevision(
            RevisionInsert(
                id = revisionId,
                amendmentId = amendmentId,
                predecessorRevisionId = null,
                title = request.title.trim(),
                summary = request.summary?.trim()?.ifBlank { null } ?: "",
                enactedOn = request.enactedOn,
                effectiveOn = request.effectiveOn,
                sourceReference = request.sourceReference?.trim()?.ifBlank { null },
                sourceVersionId = request.sourceVersionId,
                targetVersionId = request.targetVersionId,
                createdBy = actor.id,
            ),
        )
        amendmentRepository.insertChanges(revisionId, request.changes)
        return amendmentRepository.getAmendmentDtoForRevision(amendmentId, revisionId)
            ?: throw IllegalStateException("created amendment not readable")
    }

    @Transactional
    fun appendRevision(amendmentId: UUID, request: AmendmentWriteRequest, actor: Actor): AmendmentDto {
        if (!amendmentRepository.amendmentExists(amendmentId)) {
            throw NotFoundException("amendment not found")
        }
        validateChanges(request.changes.map { it.changeType })
        val tipRevisionId =
            amendmentRepository.findTipRevisionId(amendmentId)
                ?: throw IllegalStateException("amendment has no revisions")
        val revisionId = UUID.randomUUID()
        try {
            amendmentRepository.insertRevision(
                RevisionInsert(
                    id = revisionId,
                    amendmentId = amendmentId,
                    predecessorRevisionId = tipRevisionId,
                    title = request.title.trim(),
                    summary = request.summary?.trim()?.ifBlank { null } ?: "",
                    enactedOn = request.enactedOn,
                    effectiveOn = request.effectiveOn,
                    sourceReference = request.sourceReference?.trim()?.ifBlank { null },
                    sourceVersionId = request.sourceVersionId,
                    targetVersionId = request.targetVersionId,
                    createdBy = actor.id,
                ),
            )
        } catch (_: DataIntegrityViolationException) {
            throw ConflictException("revision would branch the chain")
        }
        amendmentRepository.insertChanges(revisionId, request.changes)
        return amendmentRepository.getAmendmentDtoForRevision(amendmentId, revisionId)
            ?: throw IllegalStateException("appended revision not readable")
    }

    @Transactional
    fun publishAmendment(amendmentId: UUID): AmendmentDto {
        if (!amendmentRepository.amendmentExists(amendmentId)) {
            throw NotFoundException("amendment not found")
        }
        val tipRevisionId =
            amendmentRepository.findTipRevisionId(amendmentId)
                ?: throw IllegalStateException("amendment has no revisions")
        val status = amendmentRepository.getAmendmentStatus(amendmentId)
        val publishedRevisionId = amendmentRepository.getPublishedRevisionId(amendmentId)
        if (status == "published" && publishedRevisionId == tipRevisionId) {
            throw ConflictException("amendment already published at this revision")
        }
        amendmentRepository.publishAmendment(amendmentId, tipRevisionId)
        return amendmentRepository.getPublishedAmendment(amendmentId)
            ?: throw IllegalStateException("published amendment not readable")
    }

    @Transactional
    fun withdrawAmendment(amendmentId: UUID): AmendmentDto {
        if (!amendmentRepository.amendmentExists(amendmentId)) {
            throw NotFoundException("amendment not found")
        }
        amendmentRepository.withdrawAmendment(amendmentId)
        val tipRevisionId =
            amendmentRepository.findTipRevisionId(amendmentId)
                ?: throw IllegalStateException("amendment has no revisions")
        return amendmentRepository.getAmendmentDtoForRevision(amendmentId, tipRevisionId)
            ?: throw IllegalStateException("withdrawn amendment not readable")
    }

    @Transactional
    fun linkTarget(amendmentId: UUID, request: LinkTargetRequest, actor: Actor): AmendmentDto {
        val status = amendmentRepository.getAmendmentStatus(amendmentId)
            ?: throw NotFoundException("amendment not found")
        if (status != "draft" && status != "published") {
            throw IllegalArgumentException("only draft or published amendments can be linked to a snapshot")
        }
        val tipRevisionId =
            amendmentRepository.findTipRevisionId(amendmentId)
                ?: throw IllegalStateException("amendment has no revisions")
        val tip =
            amendmentRepository.getAmendmentDtoForRevision(amendmentId, tipRevisionId)
                ?: throw IllegalStateException("amendment tip not readable")
        val sourceVersionId = request.sourceVersionId ?: tip.sourceVersionId
        return appendRevision(
            amendmentId,
            AmendmentWriteRequest(
                title = tip.title,
                summary = tip.summary,
                enactedOn = tip.enactedOn,
                effectiveOn = tip.effectiveOn,
                sourceReference = tip.sourceReference,
                sourceVersionId = sourceVersionId,
                targetVersionId = request.targetVersionId,
                changes =
                tip.changes.map { change ->
                    AmendmentChangeWriteRequest(
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
                },
            ),
            actor,
        )
    }

    fun suggest(request: SuggestRequest): SuggestResponse {
        if (request.sourceVersionId == request.targetVersionId) {
            throw IllegalArgumentException("sourceVersionId and targetVersionId must differ")
        }
        val sourceTree = contentClient.listArticles(request.sourceVersionId)
        val targetTree = contentClient.listArticles(request.targetVersionId)
        val changes = AmendmentDiff.diff(AmendmentDiff.flatten(sourceTree), AmendmentDiff.flatten(targetTree))
        return SuggestResponse(
            changes =
            changes.map { change ->
                SuggestedChangeDto(
                    articleNumber = change.node.articleNumber,
                    changeType = change.type,
                    note = noteFor(change),
                    nodeId = change.node.id,
                    articleId = change.node.articleId,
                )
            },
        )
    }

    private fun requireKind(kind: String?): String {
        val normalized = kind?.trim()
        if (normalized.isNullOrBlank() || normalized !in ALLOWED_KINDS) {
            throw IllegalArgumentException("kind must be legal_amendment or official_errata")
        }
        return normalized
    }

    private fun validateChanges(changeTypes: List<String>) {
        changeTypes.forEach { type ->
            if (type !in ALLOWED_CHANGE_TYPES) {
                throw IllegalArgumentException("changeType must be added, changed, or removed")
            }
        }
    }

    private fun noteFor(change: NodeChange): String {
        val label = change.node.number ?: change.node.label ?: change.node.kind
        return when (change.type) {
            "added" -> "Added $label"
            "removed" -> "Removed $label"
            else -> "Title or body changed on $label"
        }
    }
}

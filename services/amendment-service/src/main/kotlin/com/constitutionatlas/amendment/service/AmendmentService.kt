package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentDocumentDto
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentRevisionDto
import com.constitutionatlas.amendment.api.AmendmentWriteRequest
import com.constitutionatlas.amendment.api.LinkTargetRequest
import com.constitutionatlas.amendment.api.RefreshReviewStatusResponse
import com.constitutionatlas.amendment.api.SuggestRequest
import com.constitutionatlas.amendment.api.SuggestResponse
import com.constitutionatlas.amendment.api.SuggestedChangeDto
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.CatalogVersionRef
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.repo.AmendmentRepository
import com.constitutionatlas.amendment.repo.DraftAmendmentInsert
import com.constitutionatlas.amendment.repo.PublishedPinRow
import com.constitutionatlas.amendment.repo.RevisionInsert
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.NotFoundException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

// Callers: AmendmentController. Unique write/read service for change records (AMD-11).
// API: create/revision reject kind; refresh-review-status; pins unique on publish. User: "Work on Sprint 36"

private val ALLOWED_CHANGE_TYPES = setOf("added", "changed", "removed")

@Service
class AmendmentService(
    private val amendmentRepository: AmendmentRepository,
    private val contentClient: ContentClient,
    private val catalogClient: CatalogClient,
) {
    fun listForVersion(versionId: UUID, sourceVersionId: UUID?): List<AmendmentDto> =
        amendmentRepository.listForTargetVersion(versionId, sourceVersionId)

    fun listForConstitution(constitutionId: UUID): List<AmendmentDto> =
        amendmentRepository.listPublishedForConstitution(constitutionId)

    fun listStaffForConstitution(
        constitutionId: UUID,
        status: String? = null,
        reviewStatus: String? = null,
    ): List<AmendmentDto> =
        amendmentRepository.listStaffForConstitution(constitutionId, status, reviewStatus)

    fun getPublishedAmendment(id: UUID): AmendmentDto =
        amendmentRepository.getPublishedAmendment(id)
            ?: throw NotFoundException("amendment not found")

    fun getStaffAmendment(id: UUID): AmendmentDto {
        val tipRevisionId =
            amendmentRepository.findTipRevisionId(id)
                ?: throw NotFoundException("amendment not found")
        return amendmentRepository.getAmendmentDtoForRevision(id, tipRevisionId, includeStaff = true)
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
        rejectKind(request.kind)
        val comment = normalizeComment(request.comment)
        val documents = normalizeDocuments(request.documents)
        validateChanges(request.changes.map { it.changeType })
        val amendmentId = UUID.randomUUID()
        val revisionId = UUID.randomUUID()
        amendmentRepository.insertDraftAmendment(
            DraftAmendmentInsert(
                id = amendmentId,
                constitutionId = constitutionId,
                title = request.title.trim(),
                comment = comment,
            ),
        )
        amendmentRepository.insertRevision(
            RevisionInsert(
                id = revisionId,
                amendmentId = amendmentId,
                predecessorRevisionId = null,
                title = request.title.trim(),
                comment = comment,
                documents = documents,
                enactedOn = request.enactedOn,
                effectiveOn = request.effectiveOn,
                sourceVersionId = request.sourceVersionId,
                targetVersionId = request.targetVersionId,
                createdBy = actor.id,
            ),
        )
        amendmentRepository.insertChanges(revisionId, request.changes)
        return amendmentRepository.getAmendmentDtoForRevision(amendmentId, revisionId, includeStaff = true)
            ?: throw IllegalStateException("created amendment not readable")
    }

    @Transactional
    fun appendRevision(amendmentId: UUID, request: AmendmentWriteRequest, actor: Actor): AmendmentDto {
        rejectKind(request.kind)
        if (!amendmentRepository.amendmentExists(amendmentId)) {
            throw NotFoundException("amendment not found")
        }
        val comment = normalizeComment(request.comment)
        val documents = normalizeDocuments(request.documents)
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
                    comment = comment,
                    documents = documents,
                    enactedOn = request.enactedOn,
                    effectiveOn = request.effectiveOn,
                    sourceVersionId = request.sourceVersionId,
                    targetVersionId = request.targetVersionId,
                    createdBy = actor.id,
                ),
            )
        } catch (_: DataIntegrityViolationException) {
            throw ConflictException("revision would branch the chain")
        }
        amendmentRepository.insertChanges(revisionId, request.changes)
        return amendmentRepository.getAmendmentDtoForRevision(amendmentId, revisionId, includeStaff = true)
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
        try {
            amendmentRepository.publishAmendment(amendmentId, tipRevisionId)
        } catch (ex: DataIntegrityViolationException) {
            throw pinConflict(ex)
        }
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
        return amendmentRepository.getAmendmentDtoForRevision(amendmentId, tipRevisionId, includeStaff = true)
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
            amendmentRepository.getAmendmentDtoForRevision(amendmentId, tipRevisionId, includeStaff = true)
                ?: throw IllegalStateException("amendment tip not readable")
        val sourceVersionId = request.sourceVersionId ?: tip.sourceVersionId
        return appendRevision(
            amendmentId,
            AmendmentWriteRequest(
                title = tip.title,
                comment = tip.comment,
                documents = tip.documents,
                enactedOn = tip.enactedOn,
                effectiveOn = tip.effectiveOn,
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

    fun refreshReviewStatus(constitutionId: UUID, legalVersionId: UUID): RefreshReviewStatusResponse {
        val requested = catalogClient.getVersion(legalVersionId)
            ?: throw IllegalArgumentException("unknown legalVersionId")
        val requestedConstitutionId = requested.constitutionId
        if (requestedConstitutionId != null && requestedConstitutionId != constitutionId) {
            throw IllegalArgumentException("legalVersionId does not belong to this constitution")
        }
        val legalId = requested.legalVersionId ?: requested.id
        val liveTip = requested.currentVersionId ?: requested.id
        val cache = HashMap<UUID, CatalogVersionRef?>()
        cache[legalVersionId] = requested
        fun version(id: UUID): CatalogVersionRef? {
            if (id in cache) {
                return cache[id]
            }
            val loaded = catalogClient.getVersion(id)
            cache[id] = loaded
            return loaded
        }
        val flagged = amendmentRepository.listPublishedPins(constitutionId)
            .filter { row -> pinStaleForLegal(row, legalId, liveTip, ::version) }
            .map { it.amendmentId }
        amendmentRepository.markNeedsReview(flagged)
        return RefreshReviewStatusResponse(flaggedAmendmentIds = flagged)
    }

    private fun pinStaleForLegal(
        row: PublishedPinRow,
        legalId: UUID,
        liveTip: UUID,
        version: (UUID) -> CatalogVersionRef?,
    ): Boolean =
        pinStale(row.reviewedSourceTipId, legalId, liveTip, version) ||
            pinStale(row.reviewedTargetTipId, legalId, liveTip, version)

    private fun pinStale(
        pin: UUID?,
        legalId: UUID,
        liveTip: UUID,
        version: (UUID) -> CatalogVersionRef?,
    ): Boolean {
        if (pin == null || pin == liveTip) {
            return false
        }
        val snapshot = version(pin) ?: return false
        val pinLegal = snapshot.legalVersionId ?: snapshot.id
        return pinLegal == legalId
    }

    private fun rejectKind(kind: String?) {
        if (kind != null) {
            throw IllegalArgumentException("kind is not accepted")
        }
    }

    private fun normalizeComment(comment: String?): String = comment?.trim().orEmpty()

    private fun normalizeDocuments(documents: List<AmendmentDocumentDto>): List<AmendmentDocumentDto> =
        documents.map { document ->
            val url = document.url?.trim()?.ifBlank { null }
            val fileId = document.fileId?.trim()?.ifBlank { null }
            val label = document.label?.trim()?.ifBlank { null }
            if (url == null && fileId == null && label == null) {
                throw IllegalArgumentException("each document needs url, fileId, or label")
            }
            AmendmentDocumentDto(url = url, fileId = fileId, label = label)
        }

    private fun validateChanges(changeTypes: List<String>) {
        changeTypes.forEach { type ->
            if (type !in ALLOWED_CHANGE_TYPES) {
                throw IllegalArgumentException("changeType must be added, changed, or removed")
            }
        }
    }

    private fun pinConflict(ex: DataIntegrityViolationException): ConflictException {
        val message = ex.mostSpecificCause.message.orEmpty()
        return when {
            "published_source_pin" in message ->
                ConflictException("source snapshot already has a published change record", "source_pin_taken")
            "published_target_pin" in message ->
                ConflictException("target snapshot already has a published change record", "target_pin_taken")
            else -> ConflictException("amendment conflict")
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

package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentDocumentDto
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentRevisionDto
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.amendment.api.AmendmentWriteRequest
import com.constitutionatlas.amendment.api.LinkTargetRequest
import com.constitutionatlas.amendment.api.RefreshReviewStatusResponse
import com.constitutionatlas.amendment.api.SuggestRequest
import com.constitutionatlas.amendment.api.SuggestResponse
import com.constitutionatlas.amendment.api.SuggestedChangeDto
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.CatalogVersionRef
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.client.toAmendmentRef
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
    private val publishAttempts: com.constitutionatlas.amendment.repo.ChangeRecordPublishAttemptRepository,
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
        val requestHash = java.security.MessageDigest.getInstance("SHA-256").digest(request.toString().toByteArray()).joinToString("") { "%02x".format(it) }
        request.publishAttemptId?.let { attempt ->
            publishAttempts.lock(attempt)
            publishAttempts.find(attempt)?.let { existing ->
                if (existing.constitutionId != constitutionId || existing.requestHash != requestHash) throw ConflictException("Publish attempt payload changed")
                return amendmentRepository.getAmendmentDtoForRevision(existing.amendmentId, existing.revisionId, includeStaff = true) ?: throw NotFoundException("Reserved change record missing")
            }
        }
        rejectKind(request.kind)
        val comment = normalizeComment(request.comment)
        val documents = normalizeDocuments(request.documents)
        validateChanges(request.changes.map { it.changeType })
        val changes = validateChangeRefs(constitutionId, request.sourceVersionId, request.targetVersionId, request.changes, allowDraftTarget = true)
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
        amendmentRepository.insertChanges(revisionId, changes)
        request.publishAttemptId?.let { publishAttempts.insert(it, constitutionId, amendmentId, revisionId, requestHash) }
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
        val currentTipId = amendmentRepository.findTipRevisionId(amendmentId)
            ?: throw IllegalStateException("amendment has no revisions")
        val currentTip = amendmentRepository.getAmendmentDtoForRevision(amendmentId, currentTipId, includeStaff = true)
            ?: throw IllegalStateException("amendment tip not readable")
        val sourceVersionId = request.sourceVersionId ?: currentTip.sourceVersionId
        val targetVersionId = request.targetVersionId ?: currentTip.targetVersionId
        val changes = validateChangeRefs(currentTip.constitutionId, sourceVersionId, targetVersionId, request.changes)
        val tipRevisionId = currentTipId
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
                    sourceVersionId = sourceVersionId,
                    targetVersionId = targetVersionId,
                    createdBy = actor.id,
                ),
            )
        } catch (_: DataIntegrityViolationException) {
            throw ConflictException("revision would branch the chain")
        }
        amendmentRepository.insertChanges(revisionId, changes)
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
        val tip = amendmentRepository.getAmendmentDtoForRevision(amendmentId, tipRevisionId, includeStaff = true)
            ?: throw IllegalStateException("amendment tip not readable")
        if (tip.changes.any { it.beforeRef != null || it.afterRef != null || it.pendingAfterLogicalId != null }) {
            require(tip.changes.all { it.beforeRef != null || it.afterRef != null || it.pendingAfterLogicalId != null }) {
                "Every change needs an exact unit selection when this record uses exact links"
            }
        }
        validateChangeRefs(
            tip.constitutionId,
            tip.sourceVersionId,
            tip.targetVersionId,
            tip.changes.map { change ->
                AmendmentChangeWriteRequest(
                    articleNumber = change.articleNumber,
                    changeType = change.changeType,
                    note = change.note,
                    nodeId = change.nodeId,
                    beforeRef = change.beforeRef,
                    afterRef = change.afterRef,
                    pendingAfterLogicalId = change.pendingAfterLogicalId,
                    linkReviewReason = change.linkReviewReason,
                )
            },
        )
        try {
            amendmentRepository.publishAmendment(amendmentId, tipRevisionId)
        } catch (ex: DataIntegrityViolationException) {
            throw pinConflict(ex)
        }
        return amendmentRepository.getPublishedAmendment(amendmentId)
            ?: throw IllegalStateException("published amendment not readable")
    }

    /**
     * Republishes the currently published record with pins resolved against the live catalog tips.
     * A later staff draft is kept in history but never becomes public: the new revision copies only
     * the published record and is appended after the current tip before publication.
     */
    @Transactional
    fun confirmQuotes(amendmentId: UUID, actor: Actor): AmendmentDto {
        if (!amendmentRepository.amendmentExists(amendmentId)) {
            throw NotFoundException("amendment not found")
        }
        val publishedRevisionId = amendmentRepository.getPublishedRevisionId(amendmentId)
            ?: throw ConflictException("only a published amendment can confirm quotes")
        amendmentRepository.findTipRevisionId(amendmentId)
            ?: throw IllegalStateException("amendment has no revisions")
        val published = amendmentRepository.getAmendmentDtoForRevision(amendmentId, publishedRevisionId, includeStaff = true)
            ?: throw IllegalStateException("published amendment not readable")
        val sourceVersionId = published.sourceVersionId?.let(::liveTip)
        val targetVersionId = published.targetVersionId?.let(::liveTip)
        appendRevision(
            amendmentId,
            AmendmentWriteRequest(
                title = published.title,
                comment = published.comment,
                documents = published.documents,
                enactedOn = published.enactedOn,
                effectiveOn = published.effectiveOn,
                sourceVersionId = sourceVersionId,
                targetVersionId = targetVersionId,
                changes = published.changes.map { change ->
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
                        beforeRef = change.beforeRef?.forVersion(sourceVersionId),
                        afterRef = change.afterRef?.forVersion(targetVersionId),
                        linkReviewReason = change.linkReviewReason,
                    )
                },
            ),
            actor,
        )
        return publishAmendment(amendmentId)
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
                changes = linkedChanges(tip, sourceVersionId, request.targetVersionId),
            ),
            actor,
        )
    }

    private fun linkedChanges(tip: AmendmentDto, sourceVersionId: UUID?, targetVersionId: UUID): List<AmendmentChangeWriteRequest> {
        val explicitlySelected = tip.changes.any { it.beforeRef != null || it.afterRef != null || it.pendingAfterLogicalId != null }
        if (explicitlySelected) {
            require(tip.changes.all { it.beforeRef != null || it.afterRef != null || it.pendingAfterLogicalId != null }) {
                "Every change needs an exact unit selection when this record uses exact links"
            }
            return tip.changes.map { change ->
                fun reResolve(ref: AmendmentUnitRefDto?, versionId: UUID?): AmendmentUnitRefDto? {
                    if (ref == null || versionId == null) return null
                    val logicalId = ref.logicalId ?: throw IllegalArgumentException("Exact change selection has no logical unit")
                    return contentClient.resolve(versionId, logicalId)?.toAmendmentRef()
                        ?: throw IllegalArgumentException("Selected unit is missing from the published snapshot")
                }
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
                    beforeRef = if (change.changeType == "added") null else reResolve(change.beforeRef, sourceVersionId),
                    afterRef = if (change.changeType == "removed") null else reResolve(change.afterRef ?: change.pendingAfterLogicalId?.let { AmendmentUnitRefDto(logicalId = it) }, targetVersionId),
                    pendingAfterLogicalId = null,
                    linkReviewReason = change.linkReviewReason,
                )
            }
        }

        val sourceTree = sourceVersionId?.let(contentClient::listArticles).orEmpty()
        val targetTree = contentClient.listArticles(targetVersionId)
        val diffs = AmendmentDiff.diff(AmendmentDiff.flatten(sourceTree), AmendmentDiff.flatten(targetTree))
        if (diffs.any { it.ambiguous }) throw ConflictException("Change selection is ambiguous; choose the exact constitutional units before publishing", "ambiguous_unit_pairing")
        if (diffs.isEmpty()) {
            return tip.changes.map { change ->
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
            }
        }
        return diffs.map { change ->
            val previous = tip.changes.firstOrNull { row -> row.articleNumber == change.node.articleNumber && row.changeType == change.type }
            AmendmentChangeWriteRequest(
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
                    beforeRef = change.before?.let { toRef(request.sourceVersionId, it) },
                    afterRef = if (change.type == "removed") null else toRef(request.targetVersionId, change.node),
                    ambiguous = change.ambiguous,
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

    private fun liveTip(versionId: UUID): UUID {
        val version = catalogClient.getVersion(versionId)
            ?: throw IllegalArgumentException("unknown quoted version")
        return version.currentVersionId ?: version.id
    }

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

    private fun toRef(versionId: UUID, node: FlatNode): AmendmentUnitRefDto? {
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

    private fun AmendmentUnitRefDto.forVersion(versionId: UUID?): AmendmentUnitRefDto = copy(
        versionId = versionId,
        occurrenceId = null,
        rootOccurrenceId = null,
        revisionId = null,
        constitutionId = null,
        kind = null,
        label = null,
        breadcrumbs = emptyList(),
        text = null,
        deepLink = null,
    )

    private fun validateChangeRefs(
        constitutionId: UUID,
        sourceVersionId: UUID?,
        targetVersionId: UUID?,
        changes: List<AmendmentChangeWriteRequest>,
        allowDraftTarget: Boolean = false,
    ): List<AmendmentChangeWriteRequest> {
        val usedBefore = mutableSetOf<Pair<UUID, UUID>>()
        val usedAfter = mutableSetOf<Pair<UUID, UUID>>()
        val usedDraftTargets = mutableSetOf<UUID>()
        fun resolve(ref: AmendmentUnitRefDto?, expectedVersion: UUID?, side: String): AmendmentUnitRefDto? {
            if (ref == null) return null
            val versionId = ref.versionId ?: if (side == "After" && expectedVersion == null && allowDraftTarget) {
                val logicalId = ref.logicalId ?: throw IllegalArgumentException("$side draft reference needs a logical unit")
                val kind = ref.unitKind
                if (kind != null && kind !in setOf("node", "text_entry")) throw IllegalArgumentException("$side draft reference has an invalid unit kind")
                return AmendmentUnitRefDto(logicalId = logicalId, unitKind = kind)
            } else {
                throw IllegalArgumentException("$side reference needs a version")
            }
            if (expectedVersion == null || versionId != expectedVersion) throw IllegalArgumentException("$side reference is not pinned to this change record's snapshot")
            val logicalId = ref.logicalId ?: throw IllegalArgumentException("$side reference needs a logical unit")
            val resolved = contentClient.resolve(versionId, logicalId) ?: throw IllegalArgumentException("$side reference is not in its pinned snapshot")
            if (resolved.constitutionId != constitutionId) throw IllegalArgumentException("$side reference belongs to another constitution")
            if (ref.occurrenceId != null && ref.occurrenceId != resolved.occurrenceId) throw IllegalArgumentException("$side reference occurrence does not match the pinned snapshot")
            if (ref.revisionId != null && ref.revisionId != resolved.revisionId) throw IllegalArgumentException("$side reference revision does not match the pinned snapshot")
            val unitKind = if (resolved.kind == "parent_text") "text_entry" else "node"
            if (ref.unitKind != null && ref.unitKind != unitKind) throw IllegalArgumentException("$side reference has the wrong unit kind")
            return resolved.toAmendmentRef(unitKind)
        }
        return changes.map { change ->
            val requestedAfter = change.afterRef ?: change.pendingAfterLogicalId?.let { logical -> AmendmentUnitRefDto(logicalId = logical) }
            val hasRefs = change.beforeRef != null || requestedAfter != null
            if (!hasRefs) return@map change
            val before = resolve(change.beforeRef, sourceVersionId, "Before")
            val after = if (requestedAfter?.versionId == null && allowDraftTarget && targetVersionId == null) {
                resolve(requestedAfter, targetVersionId, "After")
            } else {
                resolve(requestedAfter, targetVersionId, "After")
            }
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
            before?.let { if (!usedBefore.add(it.versionId!! to it.occurrenceId!!)) throw IllegalArgumentException("Duplicate before reference") }
            after?.let {
                if (it.versionId == null) {
                    if (!usedDraftTargets.add(it.logicalId!!)) throw IllegalArgumentException("Duplicate draft after reference")
                } else if (!usedAfter.add(it.versionId to it.occurrenceId!!)) {
                    throw IllegalArgumentException("Duplicate after reference")
                }
            }
            if ((before?.articleNumber != null && after?.articleNumber != null) && before.articleNumber != after.articleNumber) {
                throw IllegalArgumentException("Before and after units must belong to the same article")
            }
            change.copy(
                articleNumber = before?.articleNumber ?: after?.articleNumber ?: change.articleNumber,
                beforeRef = before,
                afterRef = after?.takeIf { it.versionId != null },
                pendingAfterLogicalId = after?.takeIf { it.versionId == null }?.logicalId ?: change.pendingAfterLogicalId,
                linkReviewReason = change.linkReviewReason?.trim()?.ifBlank { null },
            )
        }
    }
}

package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.StepUpRequiredException
import com.constitutionatlas.editor.api.ChangeRecordRequest
import com.constitutionatlas.editor.api.CreateSessionRequest
import com.constitutionatlas.editor.api.DraftPreviewDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.EditSessionStatus
import com.constitutionatlas.editor.api.EditSessionSummaryDto
import com.constitutionatlas.editor.api.PublishDetailsRequest
import com.constitutionatlas.editor.api.PublishRequest
import com.constitutionatlas.editor.api.SaveDraftRequest
import com.constitutionatlas.editor.api.SaveSourceEvidenceRequest
import com.constitutionatlas.editor.api.SourceEvidenceChangesRequest
import com.constitutionatlas.editor.api.canEdit
import com.constitutionatlas.editor.api.canPublish
import com.constitutionatlas.editor.api.canReview
import com.constitutionatlas.editor.api.isAdmin
import com.constitutionatlas.editor.api.isEditorial
import com.constitutionatlas.editor.client.AmendmentClient
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.CatalogClient
import com.constitutionatlas.editor.client.ContentClient
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.SourceEvidenceRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class EditorService(
    private val identityClient: IdentityClient,
    private val auditClient: AuditClient,
    private val contentClient: ContentClient,
    private val catalogClient: CatalogClient,
    private val amendmentClient: AmendmentClient,
    private val amendmentActions: AmendmentActions,
    private val editorRepository: EditorRepository,
    private val structuredPublication: StructuredPublicationService,
    private val structuredPublishJobs: com.constitutionatlas.editor.repo.StructuredPublishJobRepository,
    private val structuredDiffReview: StructuredDiffReviewService,
    private val sourceEvidence: SourceEvidenceRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val publication = EditorPublication(editorRepository, structuredPublication, structuredPublishJobs, structuredDiffReview, sourceEvidence, catalogClient, contentClient, amendmentClient, amendmentActions, auditClient, log)

    fun actor(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.isEditorial()) {
            throw ForbiddenException("Editorial role required")
        }
        return actor
    }

    @Transactional
    fun createSession(authorization: String?, request: CreateSessionRequest): EditSessionDto {
        val actor = actor(authorization)
        requireEdit(actor)
        val hopKind = normalizeHopKind(request.hopKind)
        val existing = editorRepository.findOpenSession(actor.id, request.versionId, hopKind)
        val id = existing ?: editorRepository.insertSession(actor.id, request.versionId, hopKind)
        val session = editorRepository.findSession(id) ?: throw NotFoundException("Session missing after insert")
        if (existing == null) {
            auditClient.record(actor, "session_opened", "edit_session", id, mapOf("versionId" to request.versionId))
        }
        return session
    }

    fun listSessions(
        authorization: String?,
        status: String?,
        openedBy: String?,
        versionId: UUID?,
        limit: Int,
        offset: Int,
        archived: Boolean = false,
    ): List<EditSessionSummaryDto> {
        require(limit in 1..100) { "limit must be between 1 and 100" }
        require(offset >= 0) { "offset must be non-negative" }
        val actor = actor(authorization)
        val owner =
            when {
                openedBy.isNullOrBlank() -> null
                openedBy == "me" -> actor.id
                else ->
                    try {
                        UUID.fromString(openedBy)
                    } catch (_: IllegalArgumentException) {
                        throw IllegalArgumentException("openedBy must be a user id or 'me'")
                    }
            }
        val statusFilter =
            status?.ifBlank { null }?.let { EditSessionStatus.fromJson(it) }
        return editorRepository.listSessions(statusFilter, owner, versionId, limit, offset, archived)
    }

    @Transactional
    fun archive(authorization: String?, sessionId: UUID, archived: Boolean) {
        val actor = actor(authorization)
        structuredPublication.lock(sessionId)
        val session = requireOwned(actor, sessionId)
        requireStatus(session, EditSessionStatus.PUBLISHED)
        editorRepository.setArchived(sessionId, archived)
        auditClient.record(actor, if (archived) "session_archived" else "session_restored", "edit_session", sessionId, emptyMap<String, Any>())
    }

    @Transactional
    fun discard(authorization: String?, sessionId: UUID) {
        val actor = actor(authorization)
        requireEdit(actor)
        structuredPublication.lock(sessionId)
        val session = requireOwned(actor, sessionId)
        if (session.status == EditSessionStatus.DISCARDED) return
        requireStatus(session, EditSessionStatus.OPEN)
        editorRepository.updateStatus(sessionId, EditSessionStatus.DISCARDED)
        auditClient.record(actor, "draft_discarded", "edit_session", sessionId, emptyMap<String, Any>())
    }

    fun preview(authorization: String?, sessionId: UUID): DraftPreviewDto {
        val actor = actor(authorization)
        requireVisible(actor, sessionId)
        return previewDto(sessionId)
    }

    @Transactional
    fun save(authorization: String?, sessionId: UUID, request: SaveDraftRequest): DraftPreviewDto {
        val actor = actor(authorization)
        requireEdit(actor)
        structuredPublication.lock(sessionId)
        val session = requireOwned(actor, sessionId)
        requireStatus(session, EditSessionStatus.OPEN)
        if (editorRepository.hasStructuredDraft(sessionId)) throw ConflictException("Use targeted structured saves for this session", "mixed_draft_formats")
        val original = contentClient.listArticles(session.versionId).find { it.id == request.articleId }
        if (original != null && (mixedContent(original.content) || (original.children.isNotEmpty() && request.body != null && request.body != original.body))) {
            throw ConflictException("Use targeted structured changes to preserve child units and parent text", "structured_draft_required")
        }
        val payload = mapOf(
            "articleId" to request.articleId,
            "title" to request.title,
            "body" to request.body,
        )
        editorRepository.insertChange(sessionId, request.articleId, "save", payload)
        val sequence = editorRepository.nextRevisionSequence(sessionId)
        editorRepository.insertRevision(sessionId, sequence, payload)
        auditClient.record(actor, "draft_saved", "edit_session", sessionId, payload)
        return previewDto(session.id)
    }

    @Transactional
    fun saveSourceEvidence(authorization: String?, sessionId: UUID, request: SaveSourceEvidenceRequest): DraftPreviewDto {
        val actor = actor(authorization)
        requireEdit(actor)
        structuredPublication.lock(sessionId)
        val session = requireOwned(actor, sessionId)
        requireStatus(session, EditSessionStatus.OPEN)
        require(session.hopKind == "editorial_correction") { "Source evidence requires an editorial correction" }
        request.evidence.validate()
        val reason = request.reason.trim()
        require(reason.isNotEmpty() && reason.length <= 4000) { "A change reason of at most 4000 characters is required" }
        val previous = sourceEvidence.latest(sessionId)
        if (request.expectedRevision != (previous?.revision ?: 0)) throw ConflictException("Source evidence changed; reload before saving", "stale_source_evidence")
        val source = catalogClient.getVersion(session.versionId)
        if (source.publicationStatus != "published") throw ConflictException("Source must be published", "stale_source")
        if (source.currentVersionId != null && source.currentVersionId != source.id) throw ConflictException("Source is no longer the editorial tip", "not_editorial_tip")
        require(request.evidence != (previous?.evidence ?: source.sourceEvidence)) { "No source evidence changes to save" }
        if (editorRepository.listLatestDrafts(sessionId).isNotEmpty()) throw ConflictException("Source evidence needs an ordered-content session", "mixed_draft_formats")
        structuredPublication.pinUnchanged(sessionId, session.versionId)
        sourceEvidence.save(sessionId, (previous?.revision ?: 0) + 1, if (previous != null) previous.original else source.sourceEvidence, request.evidence, reason, actor.id, actor.email)
        editorRepository.insertRevision(sessionId, editorRepository.nextRevisionSequence(sessionId), mapOf("format" to "source_evidence", "evidence" to request.evidence, "reason" to reason))
        editorRepository.recordPublishComment(sessionId, reason)
        auditClient.record(actor, "source_evidence_saved", "edit_session", sessionId, mapOf("revision" to (previous?.revision ?: 0) + 1, "reason" to reason))
        return previewDto(sessionId)
    }

    @Transactional
    fun requestSourceEvidenceChanges(authorization: String?, sessionId: UUID, request: SourceEvidenceChangesRequest): DraftPreviewDto {
        val actor = actor(authorization)
        requireReview(actor)
        structuredPublication.lock(sessionId)
        val session = requireVisible(actor, sessionId)
        requireStatus(session, EditSessionStatus.REVIEWING)
        val revision = sourceEvidence.latest(sessionId) ?: throw IllegalArgumentException("No source evidence draft")
        if (revision.revision != request.expectedRevision) throw ConflictException("Source evidence changed", "stale_source_evidence")
        val reason = request.reason.trim()
        require(reason.isNotEmpty() && reason.length <= 4000) { "A review reason of at most 4000 characters is required" }
        sourceEvidence.recordDecision(sessionId, "changes_requested", actor.id, actor.email, reason)
        editorRepository.updateStatus(sessionId, EditSessionStatus.OPEN)
        auditClient.record(actor, "source_evidence_changes_requested", "edit_session", sessionId, mapOf("reason" to reason, "revision" to revision.revision))
        return previewDto(sessionId)
    }

    @Transactional
    fun submitReview(authorization: String?, sessionId: UUID, sourceEvidenceRevision: Int? = null): DraftPreviewDto {
        val actor = actor(authorization)
        requireEdit(actor)
        structuredPublication.lock(sessionId)
        val session = requireOwned(actor, sessionId)
        requireStatus(session, EditSessionStatus.OPEN)
        requireSourceEvidenceRevision(sessionId, sourceEvidenceRevision)
        val lastDecision = sourceEvidence.decisions(sessionId).lastOrNull()
        if (lastDecision?.action == "changes_requested" && lastDecision.revision == sourceEvidence.latest(sessionId)?.revision) {
            throw ConflictException("Save a revised source draft before resubmitting", "source_evidence_changes_required")
        }
        if (session.hopKind == "legal" && editorRepository.changeRecord(session.id) == null) {
            throw IllegalArgumentException("Save the change record before review")
        }
        if (session.hopKind == "editorial_correction" && editorRepository.publishComment(session.id).isNullOrBlank()) {
            throw IllegalArgumentException("Save the transcription comment before review")
        }
        if (editorRepository.hasStructuredDraft(sessionId)) {
            val prepared = structuredPublication.prepare(sessionId, session.versionId)
            if (session.hopKind == "legal") structuredDiffReview.requireReadyForReview(prepared)
        }
        editorRepository.updateStatus(session.id, EditSessionStatus.REVIEWING)
        sourceEvidence.recordDecision(sessionId, "review_submitted", actor.id, actor.email)
        auditClient.record(actor, "review_submitted", "edit_session", session.id)
        return previewDto(session.id)
    }

    @Transactional
    fun approve(authorization: String?, sessionId: UUID, sourceEvidenceRevision: Int? = null): DraftPreviewDto {
        val actor = actor(authorization)
        requireReview(actor)
        structuredPublication.lock(sessionId)
        val session = requireVisible(actor, sessionId)
        requireStatus(session, EditSessionStatus.REVIEWING)
        requireSourceEvidenceRevision(sessionId, sourceEvidenceRevision)
        if (session.actorId == actor.id && !actor.isAdmin()) {
            throw ForbiddenException("A different reviewer must approve this draft")
        }
        if (editorRepository.hasStructuredDraft(sessionId)) {
            val prepared = structuredPublication.prepare(sessionId, session.versionId)
            if (session.hopKind == "legal") structuredDiffReview.requireComplete(prepared)
        }
        editorRepository.updateStatus(session.id, EditSessionStatus.APPROVED)
        sourceEvidence.recordDecision(sessionId, "review_approved", actor.id, actor.email)
        auditClient.record(actor, "review_approved", "edit_session", session.id)
        return previewDto(session.id)
    }

    @Transactional
    fun savePublishDetails(authorization: String?, sessionId: UUID, request: PublishDetailsRequest): DraftPreviewDto {
        val actor = actor(authorization)
        requireEdit(actor)
        structuredPublication.lock(sessionId)
        val session = requireOwned(actor, sessionId)
        requireStatus(session, EditSessionStatus.OPEN)
        when (session.hopKind) {
            "legal" -> {
                val record = request.changeRecord ?: throw IllegalArgumentException("changeRecord is required")
                validateChangeRecord(record)
                require(record.changes.mapNotNull { it.id }.distinct().size == record.changes.mapNotNull { it.id }.size) { "Change row IDs must be unique" }
                editorRepository.recordChangeRecord(sessionId, record)
                if (editorRepository.hasStructuredDraft(sessionId)) structuredDiffReview.recheckInvalidLinks(sessionId)
            }
            "editorial_correction" -> {
                val comment = request.comment?.trim()?.takeIf { it.isNotEmpty() }
                    ?: throw IllegalArgumentException("comment is required")
                editorRepository.recordPublishComment(sessionId, comment)
            }
            else -> throw IllegalArgumentException("session has no publish job")
        }
        return previewDto(sessionId)
    }

    @Transactional
    fun publish(authorization: String?, sessionId: UUID, request: PublishRequest): DraftPreviewDto {
        val actor = actor(authorization)
        requirePublish(actor)
        structuredPublication.lock(sessionId)
        val session = requireVisible(actor, sessionId)
        requireSourceEvidenceRevision(sessionId, request.sourceEvidenceRevision)
        val structured = editorRepository.hasStructuredDraft(sessionId)
        if (structured && session.status == EditSessionStatus.PUBLISHED) {
            structuredPublishJobs.pin(session.id, request)
            return previewDto(session.id)
        }
        requireStatus(session, EditSessionStatus.APPROVED)
        publication.publish(authorization, session, request, actor, structured)
        return previewDto(session.id)
    }

    private fun mixedContent(content: tools.jackson.databind.JsonNode?): Boolean = EditorPublicationRules.mixedContent(content)

    private fun requireEdit(actor: Actor) {
        if (!actor.canEdit()) {
            throw ForbiddenException("Editor role required")
        }
    }

    private fun requireSourceEvidenceRevision(sessionId: UUID, expected: Int?) {
        val latest = sourceEvidence.latest(sessionId) ?: return
        if (expected != latest.revision) throw ConflictException("Source evidence revision changed; reload before deciding", "stale_source_evidence")
    }

    private fun requireReview(actor: Actor) {
        if (!actor.canReview()) {
            throw ForbiddenException("Reviewer role required")
        }
    }

    private fun requirePublish(actor: Actor) {
        if (!actor.canPublish()) {
            throw ForbiddenException("Publisher role required")
        }
        if (!actor.stepUpFresh) {
            throw StepUpRequiredException()
        }
    }

    private fun requireOwned(actor: Actor, sessionId: UUID): EditSessionDto {
        val session = editorRepository.findSession(sessionId)
            ?: throw NotFoundException("Unknown session '$sessionId'")
        if (session.actorId != actor.id) {
            throw ForbiddenException("Not your session")
        }
        return session
    }

    private fun requireVisible(actor: Actor, sessionId: UUID): EditSessionDto {
        val session = editorRepository.findSession(sessionId)
            ?: throw NotFoundException("Unknown session '$sessionId'")
        if (session.status == EditSessionStatus.DISCARDED) throw NotFoundException("Unknown session")
        if (session.actorId == actor.id || actor.canReview() || actor.canPublish()) {
            return session
        }
        throw ForbiddenException("Not your session")
    }

    private fun requireStatus(session: EditSessionDto, expected: EditSessionStatus) {
        if (session.status != expected) {
            throw ConflictException("Session is ${session.status.toJson()}, expected ${expected.toJson()}")
        }
    }

    private fun previewDto(sessionId: UUID): DraftPreviewDto {
        val session = editorRepository.findSession(sessionId)
            ?: throw NotFoundException("Unknown session '$sessionId'")
        val published = editorRepository.findPublishedPreview(sessionId)
        return DraftPreviewDto(
            session = session,
            latestSnapshot = editorRepository.latestSnapshot(sessionId),
            drafts = editorRepository.listLatestDrafts(sessionId),
            publicContentUpdated = if (session.status == EditSessionStatus.PUBLISHED) true else null,
            sourceVersionId = published?.sourceVersionId,
            newVersionId = published?.newVersionId,
            newVersionLabel = published?.versionLabel,
            searchIndexStatus = editorRepository.searchIndexStatus(sessionId),
            publishComment = editorRepository.publishComment(sessionId),
            changeRecord = editorRepository.changeRecord(sessionId),
            amendmentStatus = editorRepository.amendmentActionStatus(sessionId),
            unitMapping = published?.unitMapping,
            sourceGeneration = published?.sourceGeneration,
            settingsRevisionId = published?.settingsRevisionId,
            sourceEvidenceRevisions = sourceEvidence.revisions(sessionId),
            sourceEvidenceDecisions = sourceEvidence.decisions(sessionId),
        )
    }

    private fun normalizeHopKind(raw: String?): String = EditorPublicationRules.normalizeHopKind(raw)

    private fun validateChangeRecord(record: ChangeRecordRequest) = EditorPublicationRules.validateChangeRecord(record)
}

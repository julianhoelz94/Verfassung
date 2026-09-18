package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.StepUpRequiredException
import com.constitutionatlas.editor.api.ChangeRecordChange
import com.constitutionatlas.editor.api.ChangeRecordRequest
import com.constitutionatlas.editor.api.CreateSessionRequest
import com.constitutionatlas.editor.api.DraftPreviewDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.EditSessionStatus
import com.constitutionatlas.editor.api.EditSessionSummaryDto
import com.constitutionatlas.editor.api.PublishDetailsRequest
import com.constitutionatlas.editor.api.PublishRequest
import com.constitutionatlas.editor.api.SaveDraftRequest
import com.constitutionatlas.editor.api.canEdit
import com.constitutionatlas.editor.api.canPublish
import com.constitutionatlas.editor.api.canReview
import com.constitutionatlas.editor.api.isAdmin
import com.constitutionatlas.editor.api.isEditorial
import com.constitutionatlas.editor.client.AmendmentClient
import com.constitutionatlas.editor.client.ArticleWritePayload
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.CatalogClient
import com.constitutionatlas.editor.client.CatalogVersion
import com.constitutionatlas.editor.client.ContentClient
import com.constitutionatlas.editor.client.ContentTreeArticle
import com.constitutionatlas.editor.client.ContentTreeNode
import com.constitutionatlas.editor.client.LinkedAmendment
import com.constitutionatlas.editor.client.NodeWritePayload
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
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
) {
    private val log = LoggerFactory.getLogger(javaClass)

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
    ): List<EditSessionSummaryDto> {
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
        return editorRepository.listSessions(statusFilter, owner, versionId)
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
        val session = requireOwned(actor, sessionId)
        requireStatus(session, EditSessionStatus.OPEN)
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
    fun submitReview(authorization: String?, sessionId: UUID): DraftPreviewDto {
        val actor = actor(authorization)
        requireEdit(actor)
        val session = requireOwned(actor, sessionId)
        requireStatus(session, EditSessionStatus.OPEN)
        if (session.hopKind == "legal" && editorRepository.changeRecord(session.id) == null) {
            throw IllegalArgumentException("Save the change record before review")
        }
        if (session.hopKind == "editorial_correction" && editorRepository.publishComment(session.id).isNullOrBlank()) {
            throw IllegalArgumentException("Save the transcription comment before review")
        }
        editorRepository.updateStatus(session.id, EditSessionStatus.REVIEWING)
        auditClient.record(actor, "review_submitted", "edit_session", session.id)
        return previewDto(session.id)
    }

    @Transactional
    fun approve(authorization: String?, sessionId: UUID): DraftPreviewDto {
        val actor = actor(authorization)
        requireReview(actor)
        val session = requireVisible(actor, sessionId)
        requireStatus(session, EditSessionStatus.REVIEWING)
        if (session.actorId == actor.id && !actor.isAdmin()) {
            throw ForbiddenException("A different reviewer must approve this draft")
        }
        editorRepository.updateStatus(session.id, EditSessionStatus.APPROVED)
        auditClient.record(actor, "review_approved", "edit_session", session.id)
        return previewDto(session.id)
    }

    @Transactional
    fun savePublishDetails(authorization: String?, sessionId: UUID, request: PublishDetailsRequest): DraftPreviewDto {
        val actor = actor(authorization)
        requireEdit(actor)
        val session = requireOwned(actor, sessionId)
        requireStatus(session, EditSessionStatus.OPEN)
        when (session.hopKind) {
            "legal" -> {
                val record = request.changeRecord ?: throw IllegalArgumentException("changeRecord is required")
                validateChangeRecord(record)
                editorRepository.recordChangeRecord(sessionId, record)
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
        val session = requireVisible(actor, sessionId)
        requireStatus(session, EditSessionStatus.APPROVED)
        val drafts = editorRepository.listLatestDrafts(session.id)
        if (drafts.isEmpty()) {
            throw IllegalArgumentException("No draft article changes to publish")
        }
        val hopKind = normalizeHopKind(request.hopKind)
        if (session.hopKind != null && session.hopKind != hopKind) {
            throw IllegalArgumentException("publish hopKind must match the session job")
        }
        val comment = request.comment ?: editorRepository.publishComment(session.id)
        val changeRecord = if (request.amendmentId != null) request.changeRecord else request.changeRecord ?: editorRepository.changeRecord(session.id)
        if (hopKind == "editorial_correction") {
            if (request.amendmentId != null || request.changeRecord != null) {
                throw IllegalArgumentException("editorial_correction must not include a change record")
            }
            if (comment.isNullOrBlank()) {
                throw IllegalArgumentException("editorial_correction requires comment")
            }
        } else if ((request.amendmentId == null) == (changeRecord == null)) {
            throw IllegalArgumentException("legal publish requires one change record payload or amendmentId")
        }
        changeRecord?.let(::validateChangeRecord)
        val source = catalogClient.getVersion(session.versionId)
        val versions = if (hopKind == "editorial_correction") {
            emptyList()
        } else {
            catalogClient.listVersions(source.constitutionId, "all")
        }
        val legalId = source.legalVersionId ?: source.id
        if (versions.any { it.editorialPredecessorVersionId == session.versionId } ||
            (source.currentVersionId != null && source.currentVersionId != session.versionId)
        ) {
            throw ConflictException("session version is not this law's editorial tip", "not_editorial_tip")
        }
        if (hopKind == "legal") {
            val legalPredecessors = versions.mapNotNull { it.legalPredecessorVersionId }
                .map { predecessor -> versions.find { it.id == predecessor }?.legalVersionId ?: predecessor }.toSet()
            val legalTipIds = versions.filter { it.hopKind == "initial" || it.hopKind == "legal" }
                .map { it.legalVersionId ?: it.id }.toSet() - legalPredecessors
            if (legalTipIds.isNotEmpty() && legalId !in legalTipIds) {
                throw ConflictException("session version is not the current legal tip", "not_legal_tip")
            }
        }
        val sourceTree = contentClient.listArticles(session.versionId)
        if (sourceTree.isEmpty()) {
            throw ConflictException("Source version ${session.versionId} has no articles to copy")
        }
        val changedArticles = drafts.map { draft ->
            sourceTree.find { it.id == draft.articleId }
                ?: throw ConflictException("Article ${draft.articleId} is not on this version")
        }
        val amendment = if (hopKind == "legal") {
            request.amendmentId?.let { requireAmendmentForHop(it, source.constitutionId, session.versionId, authorization) }
                ?: amendmentClient.createAmendment(
                    source.constitutionId,
                    changeRecord!!.copy(
                        changes = changedArticles.map {
                            ChangeRecordChange(it.id, it.articleNumber)
                        },
                    ),
                    authorization,
                )
        } else {
            null
        }
        val successor = createSuccessor(source, hopKind, session.versionId)
        contentClient.replaceArticles(successor.id, sourceTree.map { toWrite(it) })
        val copies = contentClient.listArticles(successor.id).associateBy { it.articleNumber }
        drafts.forEachIndexed { index, draft ->
            val sourceArticle = changedArticles[index]
            val copy = copies[sourceArticle.articleNumber]
                ?: throw ConflictException("Copied article ${sourceArticle.articleNumber} is missing")
            contentClient.updateArticle(copy.id, draft.title, draft.body)
        }
        val published = catalogClient.publishVersion(successor.id)
        if (amendment != null) {
            val payload = mapOf(
                "amendmentId" to amendment.id,
                "sourceVersionId" to session.versionId,
                "targetVersionId" to published.id,
            )
            val eventId = editorRepository.insertOutboxEvent(session.id, DomainEvents.AMENDMENT_LINK_REQUESTED, payload)
            try {
                amendmentActions.completeLink(amendment.id, session.versionId, published.id, authorization)
                editorRepository.markOutboxPublished(eventId)
                editorRepository.insertOutboxEvent(
                    session.id,
                    DomainEvents.AMENDMENT_RECORDED,
                    payload,
                    publishedAt = Instant.now(),
                )
            } catch (ex: RuntimeException) {
                log.warn("change record {} linkage queued for retry: {}", amendment.id, ex.message)
                editorRepository.markOutboxFailed(eventId, ex.message ?: ex.javaClass.simpleName)
            }
        } else {
            val eventId = editorRepository.insertOutboxEvent(
                session.id,
                DomainEvents.REVIEW_STATUS_REFRESH_REQUESTED,
                mapOf("constitutionId" to source.constitutionId, "legalVersionId" to legalId),
            )
            try {
                amendmentActions.refresh(source.constitutionId, legalId, authorization)
                editorRepository.markOutboxPublished(eventId)
            } catch (ex: RuntimeException) {
                log.warn("review status refresh queued for retry: {}", ex.message)
                editorRepository.markOutboxFailed(eventId, ex.message ?: ex.javaClass.simpleName)
            }
        }
        if (hopKind == "editorial_correction") {
            editorRepository.recordPublishComment(session.id, comment!!)
        }
        editorRepository.updateStatus(session.id, EditSessionStatus.PUBLISHED)
        editorRepository.insertOutboxEvent(
            session.id,
            DomainEvents.VERSION_PUBLISHED,
            mapOf(
                "sourceVersionId" to session.versionId,
                "newVersionId" to published.id,
                "constitutionId" to source.constitutionId,
                "actorId" to actor.id,
                "versionLabel" to published.versionLabel,
                "hopKind" to hopKind,
            ),
            publishedAt = Instant.now(),
        )
        editorRepository.insertOutboxEvent(
            session.id,
            DomainEvents.SEARCH_REINDEX_REQUESTED,
            mapOf("versionId" to published.id),
        )
        try {
            auditClient.record(
                actor,
                "version_published",
                "edit_session",
                session.id,
                mapOf(
                    "sourceVersionId" to session.versionId,
                    "newVersionId" to published.id,
                    "articleIds" to drafts.map { it.articleId },
                    "hopKind" to hopKind,
                ),
            )
        } catch (ex: RuntimeException) {
            log.warn("audit append failed after successor {} was published: {}", published.id, ex.message)
        }
        return previewDto(session.id)
    }

    private fun requireEdit(actor: Actor) {
        if (!actor.canEdit()) {
            throw ForbiddenException("Editor role required")
        }
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
        )
    }

    private fun normalizeHopKind(raw: String?): String {
        val normalized = raw?.trim()?.lowercase()
        return when (normalized) {
            "legal", "editorial_correction" -> normalized
            else -> throw IllegalArgumentException(
                "hopKind must be legal or editorial_correction",
            )
        }
    }

    private fun validateChangeRecord(record: ChangeRecordRequest) {
        if (record.title.isBlank() ||
            record.comment.isBlank() ||
            record.documents.isEmpty() ||
            record.documents.any { it.url.isNullOrBlank() && it.fileId.isNullOrBlank() }
        ) {
            throw IllegalArgumentException("Legal change record requires title, comment, and documents")
        }
    }

    private fun requireAmendmentForHop(
        amendmentId: UUID,
        constitutionId: UUID,
        sourceVersionId: UUID,
        authorization: String?,
    ): LinkedAmendment {
        val amendment = amendmentClient.getAmendment(amendmentId, authorization)
            ?: throw IllegalArgumentException("Unknown amendment '$amendmentId'")
        if (amendment.constitutionId != constitutionId) {
            throw IllegalArgumentException("Amendment belongs to a different constitution")
        }
        if (amendment.status !in setOf("draft", "published")) {
            throw IllegalArgumentException("Amendment status must be draft or published")
        }
        if (amendment.status != "draft" ||
            amendment.targetVersionId != null ||
            (amendment.sourceVersionId != null && amendment.sourceVersionId != sourceVersionId)
        ) {
            throw IllegalArgumentException("Change record must be an unlinked draft for this source version")
        }
        if (amendment.title.isBlank() ||
            amendment.comment.isBlank() ||
            amendment.documents.isEmpty() ||
            amendment.documents.any { it.url.isNullOrBlank() && it.fileId.isNullOrBlank() }
        ) {
            throw IllegalArgumentException("Legal change record requires title, comment, and documents")
        }
        return amendment
    }

    private fun createSuccessor(
        source: CatalogVersion,
        hopKind: String,
        predecessorVersionId: UUID,
    ): CatalogVersion {
        for (n in 1..50) {
            val label = "${source.versionLabel}-$n"
            try {
                return catalogClient.createDraftVersion(
                    source.constitutionId,
                    label,
                    source.effectiveDate,
                    source.languageCode,
                    predecessorVersionId,
                    hopKind,
                )
            } catch (ex: ConflictException) {
                if (ex.code == "not_legal_tip" || ex.code == "not_editorial_tip") {
                    throw ex
                }
                continue
            }
        }
        throw ConflictException("Could not allocate a successor label for '${source.versionLabel}'")
    }

    companion object {
        private fun toWrite(article: ContentTreeArticle): ArticleWritePayload {
            val newId = UUID.randomUUID()
            return ArticleWritePayload(
                articleNumber = article.articleNumber,
                title = article.title,
                body = article.body.orEmpty(),
                sortOrder = article.sortOrder,
                nodes = article.children.map(::toNodeWrite),
                id = newId,
                predecessorId = article.id,
            )
        }

        private fun toNodeWrite(node: ContentTreeNode): NodeWritePayload {
            val newId = UUID.randomUUID()
            return NodeWritePayload(
                kind = node.kind,
                label = node.label ?: node.number,
                title = node.title,
                body = node.body,
                children = node.children.map(::toNodeWrite),
                id = newId,
                predecessorId = node.id,
            )
        }
    }
}

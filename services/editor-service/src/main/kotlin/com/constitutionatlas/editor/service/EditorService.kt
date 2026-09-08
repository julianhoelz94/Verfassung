package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.StepUpRequiredException
import com.constitutionatlas.editor.api.CreateSessionRequest
import com.constitutionatlas.editor.api.DraftPreviewDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.EditSessionStatus
import com.constitutionatlas.editor.api.EditSessionSummaryDto
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
        val existing = editorRepository.findOpenSession(actor.id, request.versionId)
        val id = existing ?: editorRepository.insertSession(actor.id, request.versionId)
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
    fun publish(authorization: String?, sessionId: UUID): DraftPreviewDto {
        val actor = actor(authorization)
        requirePublish(actor)
        val session = requireVisible(actor, sessionId)
        requireStatus(session, EditSessionStatus.APPROVED)
        val drafts = editorRepository.listLatestDrafts(session.id)
        if (drafts.isEmpty()) {
            throw IllegalArgumentException("No draft article changes to publish")
        }
        val source = catalogClient.getVersion(session.versionId)
        val sourceTree = contentClient.listArticles(session.versionId)
        if (sourceTree.isEmpty()) {
            throw ConflictException("Source version ${session.versionId} has no articles to copy")
        }
        val successor = createSuccessor(source)
        contentClient.replaceArticles(successor.id, sourceTree.map { toWrite(it) })
        val copies = contentClient.listArticles(successor.id).associateBy { it.articleNumber }
        drafts.forEach { draft ->
            val sourceArticle = sourceTree.find { it.id == draft.articleId }
                ?: throw ConflictException("Article ${draft.articleId} is not on this version")
            val copy = copies[sourceArticle.articleNumber]
                ?: throw ConflictException("Copied article ${sourceArticle.articleNumber} is missing")
            contentClient.updateArticle(copy.id, draft.title, draft.body)
        }
        val published = catalogClient.publishVersion(successor.id)
        val transitionId = amendmentClient.recordTransition(session.versionId, published.id)
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
            ),
            publishedAt = Instant.now(),
        )
        if (transitionId != null) {
            editorRepository.insertOutboxEvent(
                session.id,
                DomainEvents.AMENDMENT_RECORDED,
                mapOf(
                    "transitionId" to transitionId,
                    "sourceVersionId" to session.versionId,
                    "targetVersionId" to published.id,
                ),
                publishedAt = Instant.now(),
            )
        }
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
        )
    }

    private fun createSuccessor(source: CatalogVersion): CatalogVersion {
        for (n in 1..50) {
            val label = "${source.versionLabel}-$n"
            try {
                return catalogClient.createDraftVersion(
                    source.constitutionId,
                    label,
                    source.effectiveDate,
                    source.languageCode,
                )
            } catch (_: ConflictException) {
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

package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.ForbiddenException
import com.constitutionatlas.editor.NotFoundException
import com.constitutionatlas.editor.StepUpRequiredException
import com.constitutionatlas.editor.api.Actor
import com.constitutionatlas.editor.api.CreateSessionRequest
import com.constitutionatlas.editor.api.DraftPreviewDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.SaveDraftRequest
import com.constitutionatlas.editor.api.canEdit
import com.constitutionatlas.editor.api.canPublish
import com.constitutionatlas.editor.api.canReview
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.ContentClient
import com.constitutionatlas.editor.client.IdentityClient
import com.constitutionatlas.editor.client.SearchIndexClient
import com.constitutionatlas.editor.config.EditorPublishProperties
import com.constitutionatlas.editor.repo.EditorRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class EditorService(
    private val identityClient: IdentityClient,
    private val auditClient: AuditClient,
    private val contentClient: ContentClient,
    private val searchIndexClient: SearchIndexClient,
    private val publishProperties: EditorPublishProperties,
    private val editorRepository: EditorRepository,
) {
    fun actor(authorization: String?): Actor = identityClient.authenticate(authorization)

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
        requireStatus(session, "open")
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
        requireStatus(session, "open")
        editorRepository.updateStatus(session.id, "reviewing")
        auditClient.record(actor, "review_submitted", "edit_session", session.id)
        return previewDto(session.id)
    }

    @Transactional
    fun approve(authorization: String?, sessionId: UUID): DraftPreviewDto {
        val actor = actor(authorization)
        requireReview(actor)
        val session = requireVisible(actor, sessionId)
        requireStatus(session, "reviewing")
        editorRepository.updateStatus(session.id, "approved")
        auditClient.record(actor, "review_approved", "edit_session", session.id)
        return previewDto(session.id)
    }

    @Transactional
    fun publish(authorization: String?, sessionId: UUID): DraftPreviewDto {
        val actor = actor(authorization)
        requirePublish(actor)
        val session = requireVisible(actor, sessionId)
        requireStatus(session, "approved")
        val drafts = editorRepository.listLatestDrafts(session.id)
        if (drafts.isEmpty()) {
            throw IllegalArgumentException("No draft article changes to publish")
        }
        val rewritten = if (publishProperties.rewritePublicContent) {
            drafts.forEach { draft ->
                val current = contentClient.getArticle(draft.articleId)
                if (current.versionId != session.versionId) {
                    throw ConflictException("Article ${draft.articleId} is not on this version")
                }
                contentClient.updateArticle(draft.articleId, draft.title, draft.body)
            }
            searchIndexClient.reindex()
            true
        } else {
            false
        }
        editorRepository.updateStatus(session.id, "published")
        auditClient.record(
            actor,
            "version_published",
            "edit_session",
            session.id,
            mapOf(
                "versionId" to session.versionId,
                "publicContentUpdated" to rewritten,
                "articleIds" to drafts.map { it.articleId },
            ),
        )
        return previewDto(session.id, rewritten)
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

    private fun requireStatus(session: EditSessionDto, expected: String) {
        if (session.status != expected) {
            throw ConflictException("Session is ${session.status}, expected $expected")
        }
    }

    private fun previewDto(sessionId: UUID, publicContentUpdated: Boolean? = null): DraftPreviewDto {
        val session = editorRepository.findSession(sessionId)
            ?: throw NotFoundException("Unknown session '$sessionId'")
        return DraftPreviewDto(
            session = session,
            latestSnapshot = editorRepository.latestSnapshot(sessionId),
            drafts = editorRepository.listLatestDrafts(sessionId),
            publicContentUpdated = publicContentUpdated,
        )
    }
}

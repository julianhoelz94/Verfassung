package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.NotFoundException
import com.constitutionatlas.editor.UnauthorizedException
import com.constitutionatlas.editor.api.Actor
import com.constitutionatlas.editor.api.CreateSessionRequest
import com.constitutionatlas.editor.api.DraftPreviewDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.SaveDraftRequest
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.IdentityClient
import com.constitutionatlas.editor.repo.EditorRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class EditorService(
    private val identityClient: IdentityClient,
    private val auditClient: AuditClient,
    private val editorRepository: EditorRepository,
) {
    fun actor(authorization: String?): Actor = identityClient.authenticate(authorization)

    @Transactional
    fun createSession(authorization: String?, request: CreateSessionRequest): EditSessionDto {
        val actor = actor(authorization)
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
        return ownedPreview(actor, sessionId)
    }

    @Transactional
    fun save(authorization: String?, sessionId: UUID, request: SaveDraftRequest): DraftPreviewDto {
        val actor = actor(authorization)
        val session = requireOwnedOpen(actor, sessionId)
        val payload = mapOf(
            "articleId" to request.articleId,
            "title" to request.title,
            "body" to request.body,
        )
        editorRepository.insertChange(sessionId, request.articleId, "save", payload)
        val sequence = editorRepository.nextRevisionSequence(sessionId)
        editorRepository.insertRevision(sessionId, sequence, payload)
        auditClient.record(actor, "draft_saved", "edit_session", sessionId, payload)
        return ownedPreview(actor, session.id)
    }

    @Transactional
    fun submitReview(authorization: String?, sessionId: UUID): DraftPreviewDto {
        val actor = actor(authorization)
        val session = requireOwnedOpen(actor, sessionId)
        editorRepository.updateStatus(session.id, "reviewing")
        auditClient.record(actor, "review_submitted", "edit_session", session.id)
        return ownedPreview(actor, session.id)
    }

    @Transactional
    fun publish(authorization: String?, sessionId: UUID): DraftPreviewDto {
        val actor = actor(authorization)
        val session = requireOwned(actor, sessionId)
        editorRepository.updateStatus(session.id, "published")
        auditClient.record(actor, "version_published", "edit_session", session.id)
        return ownedPreview(actor, session.id)
    }

    private fun requireOwned(actor: Actor, sessionId: UUID): EditSessionDto {
        val session = editorRepository.findSession(sessionId)
            ?: throw NotFoundException("Unknown session '$sessionId'")
        if (session.actorId != actor.id) {
            throw UnauthorizedException("Not your session")
        }
        return session
    }

    private fun requireOwnedOpen(actor: Actor, sessionId: UUID): EditSessionDto {
        val session = requireOwned(actor, sessionId)
        if (session.status == "published") {
            throw UnauthorizedException("Session is already published")
        }
        return session
    }

    private fun ownedPreview(actor: Actor, sessionId: UUID): DraftPreviewDto {
        val session = requireOwned(actor, sessionId)
        return DraftPreviewDto(session, editorRepository.latestSnapshot(sessionId))
    }
}

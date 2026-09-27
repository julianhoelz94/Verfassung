package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.EditSessionStatus
import com.constitutionatlas.editor.api.StructuredDraftPreview
import com.constitutionatlas.editor.api.StructuredDraftSave
import com.constitutionatlas.editor.api.canEdit
import com.constitutionatlas.editor.api.canPublish
import com.constitutionatlas.editor.api.canReview
import com.constitutionatlas.editor.client.StructuredSourceClient
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.StructuredDraftRepository
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class StructuredDraftService(
    private val editor: EditorService,
    private val sessions: EditorRepository,
    private val drafts: StructuredDraftRepository,
    private val sources: StructuredSourceClient,
) {
    @Transactional
    fun save(authorization: String?, sessionId: UUID, request: StructuredDraftSave): StructuredDraftPreview {
        val actor = editor.actor(authorization)
        if (!actor.canEdit()) throw ForbiddenException("Editor role required")
        drafts.lockSession(sessionId)
        val session = sessions.findSession(sessionId) ?: throw NotFoundException("Unknown session")
        if (session.actorId != actor.id) throw ForbiddenException("Not your session")
        if (session.status != EditSessionStatus.OPEN) throw ConflictException("Session must be open")
        if (sessions.listLatestDrafts(sessionId).isNotEmpty()) throw ConflictException("Plain-body and structured changes cannot be mixed", "mixed_draft_formats")
        val source = sources.source(session.versionId)
        val settings = sources.settings(session.versionId)
        if (source.settingsRevisionId != settings.id) throw ConflictException("Source and settings pins disagree", "stale_source")
        val pin = drafts.pin(sessionId)
        if (pin == null) {
            if (request.expectedGeneration != 0L) throw ConflictException("Stale draft generation", "stale_draft")
            drafts.createPin(sessionId, source, settings.id)
        } else {
            if (pin.generation != request.expectedGeneration) throw ConflictException("Stale draft generation", "stale_draft")
            if (pin.sourceGeneration != source.generation || pin.settingsRevisionId != settings.id || pin.rootRevisionIds != source.roots.map { it.revisionId }) throw ConflictException("Pinned source changed", "stale_source")
        }
        val existing = drafts.operations(sessionId)
        require(request.operations.isNotEmpty()) { "At least one targeted operation is required" }
        require((existing + request.operations).map { it.id }.distinct().size == existing.size + request.operations.size) { "Operation IDs must be unique" }
        StructuredDraftEngine.validate(source.roots, settings)
        StructuredDraftEngine.replay(source.roots, existing + request.operations, settings)
        drafts.append(sessionId, request.operations)
        sessions.insertRevision(sessionId, sessions.nextRevisionSequence(sessionId), mapOf("format" to "ordered_operations", "operations" to request.operations))
        return preview(authorization, sessionId)
    }

    @Transactional(readOnly = true)
    fun preview(authorization: String?, sessionId: UUID): StructuredDraftPreview {
        val actor = editor.actor(authorization)
        val session = sessions.findSession(sessionId) ?: throw NotFoundException("Unknown session")
        if (session.actorId != actor.id && !actor.canReview() && !actor.canPublish()) throw ForbiddenException("Not your session")
        val pin = drafts.pin(sessionId)
        val source = sources.source(session.versionId)
        val settings = sources.settings(session.versionId)
        if (source.settingsRevisionId != settings.id) throw ConflictException("Source and settings pins disagree", "stale_source")
        if (pin != null && (source.generation != pin.sourceGeneration || settings.id != pin.settingsRevisionId || source.roots.map { it.revisionId } != pin.rootRevisionIds)) throw ConflictException("Pinned source changed", "stale_source")
        val operations = drafts.operations(sessionId)
        return StructuredDraftPreview(sessionId, session.versionId, pin?.sourceGeneration ?: source.generation, pin?.settingsRevisionId ?: settings.id, pin?.generation ?: 0, pin?.rootRevisionIds ?: source.roots.map { requireNotNull(it.revisionId) }, operations, StructuredDraftEngine.replay(source.roots, operations, settings), source.roots)
    }
}

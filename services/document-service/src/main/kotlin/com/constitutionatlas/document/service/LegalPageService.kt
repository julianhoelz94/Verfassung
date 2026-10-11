package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.api.LegalPageRevisionDto
import com.constitutionatlas.document.api.LegalPageStateDto
import com.constitutionatlas.document.api.PublishLegalPageRequest
import com.constitutionatlas.document.api.SaveLegalPageDraftRequest
import com.constitutionatlas.document.repo.LegalPageRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LegalPageService(
    private val repository: LegalPageRepository,
    private val identityClient: IdentityClient,
) {
    fun validateKey(key: String) {
        if (key !in setOf("impressum", "datenschutz")) throw NotFoundException("Legal page not found")
    }

    fun admin(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if ("admin" !in actor.roles) throw ForbiddenException("Legal page administration requires admin")
        return actor
    }

    fun state(key: String): LegalPageStateDto {
        validateKey(key)
        return repository.state(key)
    }

    fun history(key: String): List<LegalPageRevisionDto> {
        validateKey(key)
        return repository.history(key)
    }

    fun published(key: String): LegalPageRevisionDto =
        state(key).published ?: throw NotFoundException("Legal page not published")

    @Transactional
    fun saveDraft(key: String, request: SaveLegalPageDraftRequest, actor: Actor): LegalPageStateDto {
        validateKey(key)
        val content = request.content.trim()
        require(content.isNotEmpty() && content.length <= 30_000) { "Legal page must contain 1 to 30000 characters" }
        require(request.expectedRevision >= 0) { "Invalid expected revision" }
        repository.ensure(key)
        if (!repository.advanceDraft(key, request.expectedRevision)) throw DocumentConflictException("Legal page draft changed")
        val revision = request.expectedRevision + 1
        repository.insertRevision(key, revision, content, actor.id)
        repository.event(key, revision, "draft_saved", actor.id)
        return state(key)
    }

    @Transactional
    fun publish(key: String, request: PublishLegalPageRequest, actor: Actor): LegalPageStateDto {
        validateKey(key)
        require(request.expectedRevision > 0) { "A saved draft is required" }
        val draft = state(key).draft ?: throw DocumentConflictException("Legal page draft missing")
        require(!draft.content.contains("BEISPIEL — VOR VERÖFFENTLICHUNG ERSETZEN")) {
            "Replace example legal details before publication"
        }
        if (!repository.publish(key, request.expectedRevision)) throw DocumentConflictException("Legal page draft changed")
        repository.event(key, request.expectedRevision, "published", actor.id)
        return state(key)
    }
}

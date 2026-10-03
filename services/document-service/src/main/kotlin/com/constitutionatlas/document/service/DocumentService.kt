package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.DocumentLinkDto
import com.constitutionatlas.document.api.LinkRequest
import com.constitutionatlas.document.api.SaveDocumentRequest
import com.constitutionatlas.document.repo.DocumentRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URI
import java.util.UUID

@Service
class DocumentService(
    private val repository: DocumentRepository,
    private val identityClient: IdentityClient,
    private val targetClient: LinkTargetClient,
) {
    fun requireWriter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (actor.roles.none { it in setOf("editor", "publisher", "admin") }) {
            throw ForbiddenException("Document writes require editor, publisher, or admin")
        }
        return actor
    }

    fun requireReader(authorization: String?): Actor = identityClient.authenticate(authorization)

    fun get(id: UUID, revision: Int? = null): DocumentDto =
        repository.get(id, revision) ?: throw NotFoundException("Document not found")

    @Transactional
    fun create(request: SaveDocumentRequest, actor: Actor): DocumentDto {
        validate(request)
        val id = UUID.randomUUID()
        val revisionId = UUID.randomUUID()
        repository.insertDocument(id, actor.id)
        repository.insertRevision(revisionId, id, 1, request.title.trim(), request.description?.trim(), request.sourceUrl?.trim(), null, null, null, actor.id)
        repository.event(id, "created", actor.id, revisionId)
        return get(id)
    }

    @Transactional
    fun revise(id: UUID, request: SaveDocumentRequest, actor: Actor): DocumentDto {
        validate(request)
        val expected = request.expectedRevision ?: throw IllegalArgumentException("expectedRevision is required")
        val current = get(id)
        if (current.status != "active" || !repository.advance(id, expected)) {
            throw DocumentConflictException("Document revision changed or document is archived")
        }
        val bytes = current.revision.fileName?.let { repository.file(current.revision.id) }
        val revisionId = UUID.randomUUID()
        repository.insertRevision(
            revisionId, id, expected + 1, request.title.trim(), request.description?.trim(),
            request.sourceUrl?.trim(), current.revision.fileName, current.revision.contentType, bytes, actor.id,
        )
        repository.event(id, "revised", actor.id, revisionId)
        return get(id)
    }

    @Transactional
    fun upload(id: UUID, expectedRevision: Int, fileName: String, contentType: String, bytes: ByteArray, actor: Actor): DocumentDto {
        require(fileName.isNotBlank()) { "File name is required" }
        require(bytes.isNotEmpty() && bytes.size <= 20 * 1024 * 1024) { "File must be between 1 byte and 20 MB" }
        require(contentType in setOf("application/pdf", "text/plain", "application/octet-stream")) { "Unsupported file type" }
        val current = get(id)
        if (current.status != "active" || !repository.advance(id, expectedRevision)) {
            throw DocumentConflictException("Document revision changed or document is archived")
        }
        val revisionId = UUID.randomUUID()
        repository.insertRevision(
            revisionId, id, expectedRevision + 1, current.revision.title, current.revision.description,
            current.revision.sourceUrl, fileName.trim(), contentType, bytes, actor.id,
        )
        repository.event(id, "file_uploaded", actor.id, revisionId)
        return get(id)
    }

    @Transactional
    fun archive(id: UUID, actor: Actor): DocumentDto {
        get(id)
        if (!repository.archive(id)) throw DocumentConflictException("Document already archived")
        repository.event(id, "archived", actor.id, null)
        return get(id)
    }

    @Transactional
    fun attach(targetType: String, targetId: UUID, request: LinkRequest, actor: Actor, authorization: String?): List<DocumentLinkDto> {
        validateTarget(targetType)
        targetClient.requireTarget(targetType, targetId, authorization)
        val document = get(request.documentId)
        require(document.status == "active") { "Cannot attach an archived document" }
        request.revisionId?.let { revisionId ->
            require(repository.revisionById(revisionId)?.documentId == request.documentId) { "Revision does not belong to document" }
        }
        if (currentLinks(targetType, targetId).any { it.documentId == request.documentId }) {
            throw DocumentConflictException("Document is already linked")
        }
        repository.linkEvent(targetType, targetId, request.documentId, request.revisionId, "attach", actor.id)
        return currentLinks(targetType, targetId)
    }

    @Transactional
    fun detach(targetType: String, targetId: UUID, documentId: UUID, actor: Actor, authorization: String?): List<DocumentLinkDto> {
        validateTarget(targetType)
        targetClient.requireTarget(targetType, targetId, authorization)
        if (currentLinks(targetType, targetId).none { it.documentId == documentId }) {
            throw NotFoundException("Document link not found")
        }
        repository.linkEvent(targetType, targetId, documentId, null, "detach", actor.id)
        return currentLinks(targetType, targetId)
    }

    fun currentLinks(targetType: String, targetId: UUID): List<DocumentLinkDto> {
        validateTarget(targetType)
        return repository.linkEvents(targetType, targetId)
            .distinctBy { it.documentId }
            .filter { it.action == "attach" }
            .map { event ->
                val revision = event.revisionId?.let { repository.revisionById(it)?.revision }
                DocumentLinkDto(event.documentId, event.revisionId, get(event.documentId, revision))
            }
    }

    private fun validate(request: SaveDocumentRequest) {
        require(request.title.isNotBlank() && request.title.length <= 500) { "Title must be 1 to 500 characters" }
        request.sourceUrl?.takeIf { it.isNotBlank() }?.let {
            val uri = runCatching { URI(it) }.getOrNull()
            require(uri?.scheme in setOf("http", "https") && !uri?.host.isNullOrBlank()) { "sourceUrl must be an HTTP URL" }
        }
    }

    private fun validateTarget(targetType: String) {
        require(targetType == "constitution" || targetType == "amendment") { "Unsupported link target" }
    }
}

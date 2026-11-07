package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.BibliographyDto
import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.LinkRequest
import com.constitutionatlas.document.api.SaveDocumentRequest
import com.constitutionatlas.document.repo.EditorDocumentRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.fasterxml.jackson.annotation.JsonInclude
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.security.MessageDigest
import java.util.UUID

data class CreateLinkedDocumentRequest(
    val operationId: UUID,
    val title: String,
    val description: String? = null,
    val sourceUrl: String? = null,
    val scopeRevisionId: UUID? = null,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val citationKey: String? = null,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val bibliography: BibliographyDto? = null,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val citationNote: String? = null,
)

@Service
class EditorDocumentService(
    private val operations: EditorDocumentRepository,
    private val documents: DocumentService,
    private val mapper: ObjectMapper,
) {
    /** Identity, bytes, pinned attachment and retry receipt commit together in Document's database. */
    @Transactional
    fun create(
        targetType: String,
        targetId: UUID,
        request: CreateLinkedDocumentRequest,
        fileName: String?,
        contentType: String?,
        bytes: ByteArray?,
        actor: Actor,
        authorization: String?,
    ): DocumentDto {
        require(targetType in setOf("library", "constitution", "version", "amendment") || targetType in ingestionLinkTypes || targetType in materialLinkTypes) { "Unsupported editor target" }
        if (actor.roles.none { it == "editor" || it == "admin" }) {
            if (bytes != null || request.citationKey != null || request.description.isNullOrBlank()) throw ForbiddenException("Library uploads require editor or admin")
            if (request.bibliography != null && request.bibliography != BibliographyDto(type = "commentary")) throw ForbiddenException("Library metadata requires editor or admin")
        }
        require(bytes != null || !request.sourceUrl.isNullOrBlank() || (targetType in materialLinkTypes && !request.description.isNullOrBlank())) { "A file, source URL or commentary is required" }
        require((request.description?.length ?: 0) <= 10000 && (request.sourceUrl?.length ?: 0) <= 2048) { "Document metadata is too long" }
        if (targetType != "library") documents.requireEditableTarget(targetType, targetId, request.scopeRevisionId, authorization)
        val hash = digest(mapper.writeValueAsBytes(listOf(targetType, targetId, request, fileName, contentType, bytes?.let(::digest))))
        operations.lock(actor.id, request.operationId)
        operations.find(actor.id, request.operationId)?.let { (previous, id, revision) ->
            if (previous != hash) throw DocumentConflictException("Operation already used for another document")
            return documents.get(id, revision)
        }
        val created = documents.create(
            SaveDocumentRequest(request.title, request.description, request.sourceUrl, citationKey = request.citationKey, bibliography = request.bibliography),
            actor,
        )
        val stored = if (bytes == null) {
            created
        } else {
            documents.upload(
                created.id,
                created.currentRevision,
                fileName ?: "document",
                contentType ?: "application/octet-stream",
                bytes,
                actor,
            )
        }
        if (targetType != "library") documents.attach(targetType, targetId, LinkRequest(stored.id, stored.revision.id, request.scopeRevisionId, request.citationNote), actor, authorization)
        operations.save(actor.id, request.operationId, hash, stored.id, stored.revision.revision)
        return stored
    }

    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

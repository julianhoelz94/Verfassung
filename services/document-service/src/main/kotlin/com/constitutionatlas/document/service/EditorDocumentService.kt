package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.LinkRequest
import com.constitutionatlas.document.api.SaveDocumentRequest
import com.constitutionatlas.document.repo.EditorDocumentRepository
import com.constitutionatlas.platform.Actor
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
        require(targetType in setOf("constitution", "version", "amendment") || targetType in materialLinkTypes) { "Unsupported editor target" }
        require(bytes != null || !request.sourceUrl.isNullOrBlank() || (targetType in materialLinkTypes && !request.description.isNullOrBlank())) { "A file, source URL or commentary is required" }
        require((request.description?.length ?: 0) <= 10000 && (request.sourceUrl?.length ?: 0) <= 2048) { "Document metadata is too long" }
        documents.requireEditableTarget(targetType, targetId, request.scopeRevisionId, authorization)
        val hash = digest(mapper.writeValueAsBytes(listOf(targetType, targetId, request, fileName, contentType, bytes?.let(::digest))))
        operations.lock(actor.id, request.operationId)
        operations.find(actor.id, request.operationId)?.let { (previous, id, revision) ->
            if (previous != hash) throw DocumentConflictException("Operation already used for another document")
            return documents.get(id, revision)
        }
        val created = documents.create(SaveDocumentRequest(request.title, request.description, request.sourceUrl), actor)
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
        documents.attach(targetType, targetId, LinkRequest(stored.id, stored.revision.id, request.scopeRevisionId), actor, authorization)
        operations.save(actor.id, request.operationId, hash, stored.id, stored.revision.revision)
        return stored
    }

    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

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

    fun requireReader(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") }) {
            throw ForbiddenException("Document history requires editorial access")
        }
        return actor
    }

    fun get(id: UUID, revision: Int? = null): DocumentDto =
        repository.get(id, revision) ?: throw NotFoundException("Document not found")

    fun getVisible(id: UUID, revision: Int?, authorization: String?): DocumentDto {
        val document = get(id, revision)
        if (authorization != null) {
            requireReader(authorization)
        } else if (!publiclyLinked(id, document.revision.id)) {
            throw NotFoundException("Document not found")
        }
        return document
    }

    private fun publiclyLinked(documentId: UUID, revisionId: UUID): Boolean =
        repository.activeLinksForDocument(documentId).any { link ->
            if (link.targetType == "amendment") {
                val publishedScope = targetClient.publishedAmendmentRevision(link.targetId)
                publishedScope != null &&
                    currentLinks("amendment", link.targetId, publishedScope).any { current ->
                        current.documentId == documentId && current.document.revision.id == revisionId
                    }
            } else if (link.targetType in setOf("country_wiki", "constitution_wiki")) {
                val revision = repository.revisionById(link.revisionId ?: return@any false)?.revision ?: return@any false
                link.revisionId == revisionId &&
                    link.scopeRevisionId != null &&
                    targetClient.isWikiImagePublic(link.targetType, link.targetId, link.scopeRevisionId, documentId, revision)
            } else {
                (link.revisionId == null && get(documentId).revision.id == revisionId || link.revisionId == revisionId) &&
                    targetClient.isPublic(link.targetType, link.targetId, link.scopeRevisionId)
            }
        }

    fun targetIsPublic(targetType: String, targetId: UUID, scopeRevisionId: UUID?): Boolean {
        validateTarget(targetType)
        return targetClient.isPublic(targetType, targetId, scopeRevisionId)
    }

    fun publicLinks(targetType: String, targetId: UUID, scopeRevisionId: UUID?): List<DocumentLinkDto> =
        currentLinks(targetType, targetId, scopeRevisionId).filter { link ->
            if (targetType in setOf("country_wiki", "constitution_wiki")) {
                scopeRevisionId != null &&
                    targetClient.isWikiImagePublic(targetType, targetId, scopeRevisionId, link.documentId, link.document.revision.revision)
            } else {
                true
            }
        }

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
        val supportedDocuments = setOf("application/pdf", "text/plain", "application/octet-stream")
        val supportedImages = setOf("image/jpeg", "image/png", "image/gif", "image/webp", "image/avif")
        require(contentType in supportedDocuments || contentType in supportedImages) { "Unsupported file type" }
        if (contentType in supportedImages) {
            require(validImageSignature(contentType, bytes) && runCatching { validImageDimensions(contentType, bytes) }.getOrDefault(false)) {
                "Image content or dimensions are invalid"
            }
        }
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

    private fun validImageSignature(contentType: String, bytes: ByteArray): Boolean {
        fun at(offset: Int, signature: ByteArray): Boolean =
            bytes.size >= offset + signature.size && signature.indices.all { bytes[offset + it] == signature[it] }
        fun ascii(value: String): ByteArray = value.toByteArray(Charsets.US_ASCII)
        return when (contentType) {
            "image/jpeg" -> at(0, byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte()))
            "image/png" -> at(0, byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
            "image/gif" -> at(0, ascii("GIF87a")) || at(0, ascii("GIF89a"))
            "image/webp" -> at(0, ascii("RIFF")) && at(8, ascii("WEBP"))
            "image/avif" -> at(4, ascii("ftyp")) && (at(8, ascii("avif")) || at(8, ascii("avis")))
            else -> false
        }
    }

    private fun validImageDimensions(contentType: String, bytes: ByteArray): Boolean {
        val dimensions = when (contentType) {
            "image/jpeg", "image/png", "image/gif" -> {
                javax.imageio.ImageIO.createImageInputStream(java.io.ByteArrayInputStream(bytes)).use { input ->
                    val readers = javax.imageio.ImageIO.getImageReaders(input)
                    if (!readers.hasNext()) return false
                    val reader = readers.next()
                    try {
                        reader.input = input
                        reader.getWidth(0) to reader.getHeight(0)
                    } finally {
                        reader.dispose()
                    }
                }
            }
            "image/webp" -> {
                if (bytes.size < 30) return false
                val subtype = String(bytes, 12, 4, Charsets.US_ASCII)
                when (subtype) {
                    "VP8X" -> {
                        val width = 1 + (bytes[24].toInt() and 255) + ((bytes[25].toInt() and 255) shl 8) + ((bytes[26].toInt() and 255) shl 16)
                        val height = 1 + (bytes[27].toInt() and 255) + ((bytes[28].toInt() and 255) shl 8) + ((bytes[29].toInt() and 255) shl 16)
                        width to height
                    }
                    "VP8L" -> {
                        if (bytes[20].toInt() and 255 != 0x2f) return false
                        val width = 1 + (bytes[21].toInt() and 255) + (((bytes[22].toInt() and 255) and 0x3f) shl 8)
                        val height = 1 + ((bytes[22].toInt() and 255) ushr 6) + ((bytes[23].toInt() and 255) shl 2) + (((bytes[24].toInt() and 255) and 0x0f) shl 10)
                        width to height
                    }
                    "VP8 " -> {
                        if (bytes[23] != 0x9d.toByte() || bytes[24] != 0x01.toByte() || bytes[25] != 0x2a.toByte()) return false
                        val width = (bytes[26].toInt() and 255) + (((bytes[27].toInt() and 255) and 0x3f) shl 8)
                        val height = (bytes[28].toInt() and 255) + (((bytes[29].toInt() and 255) and 0x3f) shl 8)
                        width to height
                    }
                    else -> return false
                }
            }
            "image/avif" -> {
                val marker = "ispe".toByteArray(Charsets.US_ASCII)
                val index = bytes.indices.firstOrNull { at ->
                    at + 16 <= bytes.size && marker.indices.all { bytes[at + it] == marker[it] }
                } ?: return false
                fun bigEndian(offset: Int): Int =
                    ((bytes[offset].toInt() and 255) shl 24) or
                        ((bytes[offset + 1].toInt() and 255) shl 16) or
                        ((bytes[offset + 2].toInt() and 255) shl 8) or
                        (bytes[offset + 3].toInt() and 255)
                bigEndian(index + 8) to bigEndian(index + 12)
            }
            else -> return false
        }
        return dimensions.first in 1..10000 && dimensions.second in 1..10000 && dimensions.first.toLong() * dimensions.second <= 100_000_000
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
        validateScope(targetType, targetId, request.scopeRevisionId, authorization)
        targetClient.requireTarget(targetType, targetId, authorization)
        val document = get(request.documentId)
        require(document.status == "active") { "Cannot attach an archived document" }
        require(request.revisionId != null) { "A pinned document revision is required" }
        require(repository.revisionById(request.revisionId)?.documentId == request.documentId) { "Revision does not belong to document" }
        if (currentLinks(targetType, targetId, request.scopeRevisionId, authorization).any { it.documentId == request.documentId }) {
            throw DocumentConflictException("Document is already linked")
        }
        repository.linkEvent(targetType, targetId, request.scopeRevisionId, request.documentId, request.revisionId, "attach", actor.id)
        return currentLinks(targetType, targetId, request.scopeRevisionId, authorization)
    }

    @Transactional
    fun detach(targetType: String, targetId: UUID, scopeRevisionId: UUID?, documentId: UUID, actor: Actor, authorization: String?): List<DocumentLinkDto> {
        validateTarget(targetType)
        validateScope(targetType, targetId, scopeRevisionId, authorization)
        targetClient.requireTarget(targetType, targetId, authorization)
        if (currentLinks(targetType, targetId, scopeRevisionId, authorization).none { it.documentId == documentId }) {
            throw NotFoundException("Document link not found")
        }
        repository.linkEvent(targetType, targetId, scopeRevisionId, documentId, null, "detach", actor.id)
        return currentLinks(targetType, targetId, scopeRevisionId, authorization)
    }

    fun currentLinks(targetType: String, targetId: UUID, scopeRevisionId: UUID?, authorization: String? = null): List<DocumentLinkDto> {
        validateTarget(targetType)
        val scopes = if (targetType == "amendment" && scopeRevisionId != null) {
            listOf<UUID?>(null) + targetClient.amendmentAncestry(targetId, scopeRevisionId, authorization)
        } else {
            listOf(scopeRevisionId)
        }
        val state = linkedMapOf<UUID, com.constitutionatlas.document.api.DocumentLinkEventDto>()
        scopes.forEach { scope ->
            repository.linkEvents(targetType, targetId, scope).asReversed().forEach { event ->
                state[event.documentId] = event
            }
        }
        return state.values
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
        require(targetType in setOf("constitution", "version", "amendment", "country_wiki", "constitution_wiki")) { "Unsupported link target" }
    }

    private fun validateScope(targetType: String, targetId: UUID, scopeRevisionId: UUID?, authorization: String?) {
        if (targetType == "amendment") {
            require(scopeRevisionId != null) { "Amendment revision is required" }
            targetClient.requireAmendmentRevision(targetId, scopeRevisionId, authorization, false)
        } else if (targetType in setOf("country_wiki", "constitution_wiki")) {
            require(scopeRevisionId != null) { "Wiki revision is required" }
            targetClient.requireWikiRevision(targetType, targetId, scopeRevisionId, authorization)
        } else {
            require(scopeRevisionId == null) { "This link does not have a revision scope" }
        }
    }
}

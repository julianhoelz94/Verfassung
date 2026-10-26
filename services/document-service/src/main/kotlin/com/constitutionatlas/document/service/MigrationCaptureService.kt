package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.SaveDocumentRequest
import com.constitutionatlas.document.repo.MigrationCaptureRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.StrictOrderedWrite
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID

data class MigrationCaptureRequest(
    val attemptId: UUID,
    val title: String,
    val description: String? = null,
    val sourceUrl: String? = null,
    val fileName: String? = null,
    val fileBase64: String? = null,
    val fileSha256: String? = null,
) : StrictOrderedWrite()

@Service
class MigrationCaptureService(private val captures: MigrationCaptureRepository, private val documents: DocumentService, private val mapper: ObjectMapper) {
    @Transactional
    fun create(request: MigrationCaptureRequest, actor: Actor): DocumentDto {
        require(request.title.length in 1..512 && (request.description?.length ?: 0) <= 10000) { "Invalid capture metadata" }
        require(request.sourceUrl == null || (request.sourceUrl.startsWith("https://") && request.sourceUrl.length <= 2048)) { "Capture source must use HTTPS" }
        require((request.fileBase64?.length ?: 0) <= 14 * 1024 * 1024) { "Captured file exceeds 10 MiB" }
        val bytes = request.fileBase64?.let { Base64.getDecoder().decode(it) }
        require(bytes == null || (request.fileName?.length in 1..255 && bytes.size <= 10 * 1024 * 1024 && digest(bytes) == request.fileSha256)) { "Captured file name, size or checksum is invalid" }
        val hash = digest(mapper.writeValueAsBytes(request))
        captures.lock(request.attemptId)
        captures.find(request.attemptId)?.let { (previous, document, revision) ->
            if (hash != previous) throw org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "Capture attempt contains different evidence")
            return documents.get(document, revision)
        }
        val created = documents.create(SaveDocumentRequest(request.title, request.description, request.sourceUrl), actor)
        // Archived bytes always download as an attachment; never execute source HTML.
        val stored = if (bytes == null) created else documents.upload(created.id, created.currentRevision, request.fileName!!, "application/octet-stream", bytes, actor)
        captures.save(actor.id, request.attemptId, hash, stored.id, stored.revision.revision)
        return stored
    }
    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}

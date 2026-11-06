package com.constitutionatlas.document.api

import com.constitutionatlas.document.repo.DocumentFileRepository
import com.constitutionatlas.document.service.DocumentAttachmentService
import com.constitutionatlas.document.service.DocumentService
import com.constitutionatlas.platform.NotFoundException
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.nio.charset.StandardCharsets
import java.util.UUID

@RestController
class DocumentAttachmentController(
    private val service: DocumentAttachmentService,
    private val documents: DocumentService,
    private val files: DocumentFileRepository,
) {
    @PostMapping("/documents/{id}/attachments", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun add(
        @PathVariable id: UUID,
        @RequestParam expectedRevision: Int,
        @RequestPart file: MultipartFile,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): DocumentDto = service.add(id, expectedRevision, file.originalFilename ?: "document", file.contentType ?: "application/octet-stream", file.bytes, documents.requireWriter(authorization))

    @DeleteMapping("/documents/{id}/attachments/{attachmentId}")
    fun remove(
        @PathVariable id: UUID,
        @PathVariable attachmentId: UUID,
        @RequestParam expectedRevision: Int,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): DocumentDto = service.remove(id, attachmentId, expectedRevision, documents.requireWriter(authorization))

    @PutMapping("/documents/{id}/attachments/{attachmentId}/primary")
    fun primary(
        @PathVariable id: UUID,
        @PathVariable attachmentId: UUID,
        @RequestParam expectedRevision: Int,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): DocumentDto = service.primary(id, attachmentId, expectedRevision, documents.requireWriter(authorization))

    @GetMapping("/documents/{id}/revisions/{revision}/attachments/{attachmentId}/file")
    fun file(
        @PathVariable id: UUID,
        @PathVariable revision: Int,
        @PathVariable attachmentId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): ResponseEntity<ByteArray> {
        val document = documents.getVisible(id, revision, authorization)
        val (metadata, bytes) = files.file(document.revision.id, attachmentId) ?: throw NotFoundException("Attachment not found")
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(metadata.fileName, StandardCharsets.UTF_8).build().toString())
            .header("X-Content-Type-Options", "nosniff")
            .contentType(MediaType.parseMediaType(metadata.contentType))
            .contentLength(metadata.size)
            .body(bytes)
    }
}

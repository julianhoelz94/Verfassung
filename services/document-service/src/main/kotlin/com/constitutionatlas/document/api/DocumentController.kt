package com.constitutionatlas.document.api

import com.constitutionatlas.document.repo.DocumentRepository
import com.constitutionatlas.document.service.DocumentService
import com.constitutionatlas.platform.NotFoundException
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.util.UUID

@RestController
class DocumentController(
    private val service: DocumentService,
    private val repository: DocumentRepository,
) {
    @GetMapping("/documents")
    fun list(@RequestParam(required = false) q: String?, @RequestHeader(value = "Authorization", required = false) authorization: String?): List<DocumentDto> {
        service.requireReader(authorization)
        return repository.list(q)
    }

    @GetMapping("/documents/{id}")
    fun get(@PathVariable id: UUID, @RequestParam(required = false) revision: Int?, @RequestHeader(value = "Authorization", required = false) authorization: String?): DocumentDto =
        service.getVisible(id, revision, authorization)

    @GetMapping("/documents/{id}/revisions")
    fun revisions(@PathVariable id: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): List<DocumentRevisionDto> {
        service.requireReader(authorization)
        service.get(id)
        return repository.revisions(id)
    }

    @GetMapping("/documents/{id}/events")
    fun events(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<DocumentEventDto> {
        service.requireReader(authorization)
        service.get(id)
        return repository.events(id)
    }

    @GetMapping("/documents/{id}/revisions/{revision}/file")
    fun file(@PathVariable id: UUID, @PathVariable revision: Int, @RequestHeader(value = "Authorization", required = false) authorization: String?): ResponseEntity<ByteArray> {
        val metadata = service.getVisible(id, revision, authorization).revision
        val bytes = repository.file(metadata.id) ?: throw NotFoundException("File not found")
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, (if (metadata.contentType?.startsWith("image/") == true) ContentDisposition.inline() else ContentDisposition.attachment()).filename(metadata.fileName ?: "document").build().toString())
            .contentType(MediaType.parseMediaType(metadata.contentType ?: "application/octet-stream"))
            .body(bytes)
    }

    @PostMapping("/documents")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: SaveDocumentRequest,
    ): DocumentDto = service.create(request, service.requireWriter(authorization))

    @PutMapping("/documents/{id}")
    fun revise(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: SaveDocumentRequest,
    ): DocumentDto = service.revise(id, request, service.requireWriter(authorization))

    @PostMapping("/documents/{id}/file", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam expectedRevision: Int,
        @RequestPart file: MultipartFile,
    ): DocumentDto = service.upload(
        id,
        expectedRevision,
        file.originalFilename ?: "document",
        file.contentType ?: "application/octet-stream",
        file.bytes,
        service.requireWriter(authorization),
    )

    @PostMapping("/documents/{id}/archive")
    fun archive(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): DocumentDto = service.archive(id, service.requireWriter(authorization))

    @GetMapping("/links/{targetType}/{targetId}")
    fun links(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @RequestParam(required = false) scopeRevisionId: UUID?,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<DocumentLinkDto> {
        if (authorization != null) {
            service.requireReader(authorization)
        } else if (!service.targetIsPublic(targetType, targetId, scopeRevisionId)) {
            throw NotFoundException("Links not found")
        }
        return if (authorization == null) service.publicLinks(targetType, targetId, scopeRevisionId) else service.currentLinks(targetType, targetId, scopeRevisionId, authorization)
    }

    @GetMapping("/links/{targetType}/{targetId}/events")
    fun linkEvents(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @RequestParam(required = false) scopeRevisionId: UUID?,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<DocumentLinkEventDto> {
        service.requireReader(authorization)
        return repository.linkEvents(targetType, targetId, scopeRevisionId)
    }

    @PostMapping("/links/{targetType}/{targetId}")
    fun attach(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: LinkRequest,
    ): List<DocumentLinkDto> = service.attach(targetType, targetId, request, service.requireWriter(authorization), authorization)

    @DeleteMapping("/links/{targetType}/{targetId}/{documentId}")
    fun detach(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @PathVariable documentId: UUID,
        @RequestParam(required = false) scopeRevisionId: UUID?,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<DocumentLinkDto> = service.detach(targetType, targetId, scopeRevisionId, documentId, service.requireWriter(authorization), authorization)
}

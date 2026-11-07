package com.constitutionatlas.document.api

import com.constitutionatlas.document.service.CreateLinkedDocumentRequest
import com.constitutionatlas.document.service.DocumentService
import com.constitutionatlas.document.service.EditorDocumentService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.util.UUID

@RestController
class EditorDocumentController(private val service: EditorDocumentService, private val documents: DocumentService) {
    @PostMapping("/library/documents", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @ResponseStatus(HttpStatus.CREATED)
    fun stage(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestPart metadata: CreateLinkedDocumentRequest,
        @RequestPart(required = false) file: MultipartFile?,
    ): DocumentDto = service.create("library", UUID(0, 0), metadata, file?.originalFilename, file?.contentType, file?.bytes, documents.requireWriter(authorization), authorization)

    @PostMapping("/links/{targetType}/{targetId}/documents", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestPart metadata: CreateLinkedDocumentRequest,
        @RequestPart(required = false) file: MultipartFile?,
    ): DocumentDto {
        val actor = documents.requireLinkWriter(targetType, authorization)
        return service.create(targetType, targetId, metadata, file?.originalFilename, file?.contentType, file?.bytes, actor, authorization)
    }
}

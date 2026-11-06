package com.constitutionatlas.document.api

import com.constitutionatlas.document.service.BibtexArchiveService
import com.constitutionatlas.document.service.BibtexCodec
import com.constitutionatlas.document.service.BibtexService
import com.constitutionatlas.document.service.DocumentService
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.util.UUID

@RestController
@RequestMapping("/library/bibtex")
class BibtexController(private val service: BibtexService, private val documents: DocumentService, private val archives: BibtexArchiveService) {
    @PostMapping("/preview")
    fun preview(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: BibtexPreviewRequest,
    ): BibtexPreviewDto {
        documents.requireWriter(authorization)
        return service.preview(request)
    }

    @PostMapping("/import")
    fun importEntries(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: BibtexImportRequest,
    ): BibtexImportDto = service.importEntries(request, documents.requireWriter(authorization))

    @GetMapping("/export", params = ["includeFiles!=true"])
    fun export(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(required = false) folderId: UUID?,
        @RequestParam(required = false) documentIds: String?,
    ): ResponseEntity<String> = ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, disposition(folderId, "bib"))
        .header("X-Content-Type-Options", "nosniff")
        .contentType(MediaType.parseMediaType("text/x-bibtex;charset=UTF-8"))
        .body(BibtexCodec.encode(selection(authorization, folderId, documentIds)))

    @GetMapping("/export", params = ["includeFiles=true"])
    fun exportArchive(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(required = false) folderId: UUID?,
        @RequestParam(required = false) documentIds: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val content = archives.archive(selection(authorization, folderId, documentIds))
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition(folderId, "zip"))
            .header("X-Content-Type-Options", "nosniff")
            .contentType(MediaType.parseMediaType("application/zip"))
            .body(content)
    }

    private fun disposition(folderId: UUID?, extension: String): String = ContentDisposition.attachment()
        .filename(if (folderId == null) "documents.$extension" else "folder-$folderId.$extension").build().toString()

    private fun selection(authorization: String?, folderId: UUID?, documentIds: String?): List<DocumentDto> {
        documents.requireReader(authorization)
        val ids = documentIds?.let { value ->
            val parts = value.split(',')
            require(parts.size <= 1000) { "Select at most 1000 documents" }
            parts.map { UUID.fromString(it.trim()) }.toSet()
        }
        return service.exportDocuments(folderId, ids)
    }
}

package com.constitutionatlas.ingestion.api

import com.constitutionatlas.ingestion.client.WriteAccess
import com.constitutionatlas.ingestion.service.ImportUploadService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class ImportUploadController(private val uploads: ImportUploadService, private val access: WriteAccess) {
    @PostMapping("/import-batches/{batchId}/uploads")
    @ResponseStatus(HttpStatus.CREATED)
    fun begin(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable batchId: UUID, @RequestBody request: BeginUploadRequest): ImportUploadDto =
        uploads.begin(batchId, access.requireImporter(authorization), request)

    @GetMapping("/import-uploads/{id}")
    fun get(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID): ImportUploadDto =
        uploads.get(id, access.requireImporter(authorization))

    @PutMapping("/import-uploads/{id}/chunks/{index}")
    fun putChunk(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID, @PathVariable index: Int, @RequestBody request: UploadChunkRequest): ImportUploadDto =
        uploads.putChunk(id, index, access.requireImporter(authorization), request)

    @PostMapping("/import-uploads/{id}/complete")
    fun complete(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID): ImportUploadDto =
        uploads.complete(authorization, id, access.requireImporter(authorization))
}

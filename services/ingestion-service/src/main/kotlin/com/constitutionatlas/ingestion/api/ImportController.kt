package com.constitutionatlas.ingestion.api

import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.ingestion.client.WriteAccess
import com.constitutionatlas.ingestion.service.ImportService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class ImportController(
    private val importService: ImportService,
    private val writeAccess: WriteAccess,
) {
    @PostMapping("/import-jobs")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: ImportRequest,
    ): ImportJobDto {
        writeAccess.requireImporter(authorization)
        return importService.importVersion(authorization, request)
    }

    @GetMapping("/import-jobs/{jobId}")
    fun get(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable jobId: UUID,
    ): ImportJobDto {
        writeAccess.requireImporter(authorization)
        return importService.getJob(jobId) ?: throw NotFoundException("Unknown import job '$jobId'")
    }
}

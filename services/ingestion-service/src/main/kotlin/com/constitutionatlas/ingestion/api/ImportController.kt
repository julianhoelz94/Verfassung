package com.constitutionatlas.ingestion.api

import com.constitutionatlas.ingestion.NotFoundException
import com.constitutionatlas.ingestion.service.ImportService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class ImportController(private val importService: ImportService) {
    @PostMapping("/import-jobs")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: ImportRequest): ImportJobDto = importService.importVersion(request)

    @GetMapping("/import-jobs/{jobId}")
    fun get(@PathVariable jobId: UUID): ImportJobDto =
        importService.getJob(jobId) ?: throw NotFoundException("Unknown import job '$jobId'")
}

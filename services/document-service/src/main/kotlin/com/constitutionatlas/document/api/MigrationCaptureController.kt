package com.constitutionatlas.document.api

import com.constitutionatlas.document.service.DocumentService
import com.constitutionatlas.document.service.MigrationCaptureRequest
import com.constitutionatlas.document.service.MigrationCaptureService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class MigrationCaptureController(private val captures: MigrationCaptureService, private val documents: DocumentService) {
    @PostMapping("/migration-captures")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: MigrationCaptureRequest): DocumentDto =
        captures.create(request, documents.requireWriter(authorization))
}

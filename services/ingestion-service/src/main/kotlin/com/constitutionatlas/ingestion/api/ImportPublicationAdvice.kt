package com.constitutionatlas.ingestion.api

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

class ImportPublicationException(val status: HttpStatus, val code: String, val path: String? = null, val logicalId: java.util.UUID? = null) : RuntimeException(code)

/** Stable, safe errors for staff; downstream response bodies may contain private data. */
@RestControllerAdvice
class ImportPublicationAdvice {
    @ExceptionHandler(ImportPublicationException::class)
    fun publication(ex: ImportPublicationException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(ex.status).body(
            buildMap {
                put("code", ex.code)
                ex.path?.let { put("path", it) }
                ex.logicalId?.let { put("logicalId", it.toString()) }
            },
        )
}

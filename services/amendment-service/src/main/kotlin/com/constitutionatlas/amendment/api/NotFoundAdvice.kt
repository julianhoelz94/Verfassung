package com.constitutionatlas.amendment.api

import com.constitutionatlas.amendment.CatalogUnavailableException
import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.ContentUnavailableException
import com.constitutionatlas.amendment.GoneException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class NotFoundAdvice {
    @ExceptionHandler(ConflictException::class)
    fun conflict(ex: ConflictException): ResponseEntity<Map<String, String>> {
        val body = mutableMapOf("error" to (ex.message ?: "Conflict"))
        ex.code?.let { body["code"] = it }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body)
    }

    @ExceptionHandler(GoneException::class)
    fun gone(ex: GoneException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.GONE).body(
            mapOf(
                "error" to (ex.message ?: "Gone"),
                "code" to ex.code,
            ),
        )

    @ExceptionHandler(ContentUnavailableException::class)
    fun contentUnavailable(ex: ContentUnavailableException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(mapOf("error" to (ex.message ?: "Content unavailable")))

    @ExceptionHandler(CatalogUnavailableException::class)
    fun catalogUnavailable(ex: CatalogUnavailableException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(mapOf("error" to (ex.message ?: "Catalog unavailable")))

    @ExceptionHandler(IllegalArgumentException::class)
    fun badRequest(ex: IllegalArgumentException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to (ex.message ?: "Bad request")))
}

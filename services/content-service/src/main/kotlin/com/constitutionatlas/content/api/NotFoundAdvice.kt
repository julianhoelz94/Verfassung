package com.constitutionatlas.content.api

import com.constitutionatlas.content.CatalogUnavailableException
import com.constitutionatlas.content.ForbiddenException
import com.constitutionatlas.content.NotFoundException
import com.constitutionatlas.content.UnauthorizedException
import com.constitutionatlas.content.VersionPublishedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class NotFoundAdvice {
    @ExceptionHandler(UnauthorizedException::class)
    fun unauthorized(ex: UnauthorizedException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to (ex.message ?: "Unauthorized")))

    @ExceptionHandler(ForbiddenException::class)
    fun forbidden(ex: ForbiddenException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to (ex.message ?: "Forbidden")))

    @ExceptionHandler(VersionPublishedException::class)
    fun versionPublished(): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(
            mapOf(
                "error" to "Cannot mutate a published version",
                "code" to "version_published",
            ),
        )

    @ExceptionHandler(CatalogUnavailableException::class)
    fun catalogUnavailable(ex: CatalogUnavailableException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(mapOf("error" to (ex.message ?: "Catalog unavailable")))

    @ExceptionHandler(NotFoundException::class)
    fun handle(ex: NotFoundException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to (ex.message ?: "Not found")))

    @ExceptionHandler(IllegalArgumentException::class)
    fun badRequest(ex: IllegalArgumentException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to (ex.message ?: "Bad request")))
}

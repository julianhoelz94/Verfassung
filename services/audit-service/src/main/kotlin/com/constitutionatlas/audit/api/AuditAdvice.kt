package com.constitutionatlas.audit.api

import com.constitutionatlas.audit.client.ForbiddenException
import com.constitutionatlas.audit.client.UnauthorizedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class AuditAdvice {
    @ExceptionHandler(UnauthorizedException::class)
    fun unauthorized(ex: UnauthorizedException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to (ex.message ?: "Unauthorized")))

    @ExceptionHandler(ForbiddenException::class)
    fun forbidden(ex: ForbiddenException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to (ex.message ?: "Forbidden")))

    @ExceptionHandler(UnsupportedOperationException::class)
    fun methodNotAllowed(ex: UnsupportedOperationException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(mapOf("error" to (ex.message ?: "Not allowed")))
}

package com.constitutionatlas.audit.api

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class AuditAdvice {
    @ExceptionHandler(UnsupportedOperationException::class)
    fun methodNotAllowed(ex: UnsupportedOperationException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(mapOf("error" to (ex.message ?: "Not allowed")))
}

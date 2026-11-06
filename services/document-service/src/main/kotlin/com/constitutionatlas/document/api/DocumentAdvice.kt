package com.constitutionatlas.document.api

import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

class DocumentConflictException(message: String, val code: String = "document_conflict") : RuntimeException(message)

@RestControllerAdvice
class DocumentAdvice {
    @ExceptionHandler(DocumentConflictException::class)
    fun conflict(ex: DocumentConflictException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to (ex.message ?: "Conflict"), "code" to ex.code))

    @ExceptionHandler(DuplicateKeyException::class)
    fun duplicate(ex: DuplicateKeyException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to "Name is already in use", "code" to "name_conflict"))

    @ExceptionHandler(IllegalArgumentException::class)
    fun invalid(ex: IllegalArgumentException): ResponseEntity<Map<String, String>> =
        ResponseEntity.badRequest().body(mapOf("error" to (ex.message ?: "Invalid request")))
}

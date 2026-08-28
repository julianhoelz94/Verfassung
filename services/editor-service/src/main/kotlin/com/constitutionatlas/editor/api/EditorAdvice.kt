package com.constitutionatlas.editor.api

import com.constitutionatlas.editor.NotFoundException
import com.constitutionatlas.editor.UnauthorizedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class EditorAdvice {
    @ExceptionHandler(UnauthorizedException::class)
    fun unauthorized(ex: UnauthorizedException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to (ex.message ?: "Unauthorized")))

    @ExceptionHandler(NotFoundException::class)
    fun notFound(ex: NotFoundException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to (ex.message ?: "Not found")))
}

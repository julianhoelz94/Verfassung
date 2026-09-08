package com.constitutionatlas.search.api

import com.constitutionatlas.search.auth.ForbiddenException
import com.constitutionatlas.search.auth.UnauthorizedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class SearchAdvice {
    @ExceptionHandler(UnauthorizedException::class)
    fun unauthorized(ex: UnauthorizedException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to (ex.message ?: "Unauthorized")))

    @ExceptionHandler(ForbiddenException::class)
    fun forbidden(ex: ForbiddenException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to (ex.message ?: "Forbidden")))
}

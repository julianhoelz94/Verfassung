package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.TooManyRequestsException
import com.constitutionatlas.identity.UnauthorizedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class AuthAdvice {
    @ExceptionHandler(UnauthorizedException::class)
    fun unauthorized(ex: UnauthorizedException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to (ex.message ?: "Unauthorized")))

    @ExceptionHandler(TooManyRequestsException::class)
    fun tooManyRequests(ex: TooManyRequestsException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(mapOf("error" to (ex.message ?: "Invalid credentials")))
}

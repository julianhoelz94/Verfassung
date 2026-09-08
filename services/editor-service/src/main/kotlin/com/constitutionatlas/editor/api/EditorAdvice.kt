package com.constitutionatlas.editor.api

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.StepUpRequiredException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class EditorAdvice {
    @ExceptionHandler(StepUpRequiredException::class)
    fun stepUp(ex: StepUpRequiredException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).body(
            mapOf(
                "error" to (ex.message ?: "Recent step-up authentication required"),
                "code" to "step_up_required",
            ),
        )

    @ExceptionHandler(ConflictException::class)
    fun conflict(ex: ConflictException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to (ex.message ?: "Conflict")))

    @ExceptionHandler(DownstreamException::class)
    fun downstream(ex: DownstreamException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(mapOf("error" to (ex.message ?: "Downstream failure")))

    @ExceptionHandler(IllegalArgumentException::class)
    fun badRequest(ex: IllegalArgumentException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to (ex.message ?: "Bad request")))
}

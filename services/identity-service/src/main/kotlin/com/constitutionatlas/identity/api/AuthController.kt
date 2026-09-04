package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.AuthService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class AuthController(private val authService: AuthService) {
    @PostMapping("/login")
    fun login(
        @RequestBody request: LoginRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): SessionDto =
        authService.login(
            email = request.email,
            password = request.password,
            clientIp = clientIp(httpRequest),
            existingAuthorization = authorization,
        )

    @GetMapping("/me")
    fun me(@RequestHeader(value = "Authorization", required = false) authorization: String?): UserDto =
        authService.me(authorization)

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(@RequestHeader(value = "Authorization", required = false) authorization: String?) {
        authService.logout(authorization)
    }

    @GetMapping("/sessions")
    fun sessions(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<SessionInfoDto> = authService.listSessions(authorization)

    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revokeSession(
        @PathVariable sessionId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ) {
        authService.revokeSession(authorization, sessionId)
    }

    @DeleteMapping("/sessions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revokeAllSessions(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ) {
        authService.revokeAllSessions(authorization)
    }

    private fun clientIp(request: HttpServletRequest): String {
        val forwarded = request.getHeader("X-Forwarded-For")?.split(",")?.firstOrNull()?.trim()
        return forwarded?.ifBlank { null } ?: request.remoteAddr ?: "unknown"
    }
}

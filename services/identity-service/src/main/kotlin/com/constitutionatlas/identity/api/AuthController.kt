package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.AuthService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.ExampleObject
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
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
@Tag(name = "Identity")
class AuthController(private val authService: AuthService) {
    @PostMapping("/login")
    @Operation(summary = "Create a session")
    @ApiResponses(
        ApiResponse(
            responseCode = "200",
            description = "Authenticated",
            content = [
                Content(
                    mediaType = "application/json",
                    schema = Schema(implementation = LoginResponse::class),
                    examples = [
                        ExampleObject(
                            name = "session",
                            value = """{"token":"opaque-session-token","user":{"id":"01900000-0000-4000-8000-000000000410","email":"local-editor@example.local","roles":["editor","publisher","reviewer"],"mfaEnabled":true,"mfaRequired":true,"stepUpFresh":true},"expiresInSeconds":86400}""",
                        ),
                        ExampleObject(
                            name = "mfa-challenge",
                            value = """{"user":{"id":"01900000-0000-4000-8000-000000000410","email":"local-editor@example.local","roles":["editor","publisher","reviewer"],"mfaEnabled":true,"mfaRequired":true,"stepUpFresh":false},"mfaRequired":true,"challengeToken":"opaque-mfa-challenge"}""",
                        ),
                    ],
                ),
            ],
        ),
        ApiResponse(
            responseCode = "401",
            description = "Invalid credentials, disabled account, or unknown user",
            content = [
                Content(
                    mediaType = "application/json",
                    examples = [ExampleObject(name = "error", value = """{"error":"Invalid credentials"}""")],
                ),
            ],
        ),
    )
    fun login(
        @RequestBody request: LoginRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): LoginResponse =
        authService.login(
            email = request.email,
            password = request.password,
            clientIp = clientIp(httpRequest),
            userAgent = httpRequest.getHeader("User-Agent"),
            existingAuthorization = authorization,
        )

    @GetMapping("/me")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Current principal")
    @ApiResponses(
        ApiResponse(
            responseCode = "200",
            description = "Active session",
            content = [
                Content(
                    mediaType = "application/json",
                    schema = Schema(implementation = UserDto::class),
                    examples = [
                        ExampleObject(
                            name = "me",
                            value = """{"id":"01900000-0000-4000-8000-000000000410","email":"local-editor@example.local","roles":["editor","publisher","reviewer"],"mfaEnabled":true,"mfaRequired":true,"stepUpFresh":true}""",
                        ),
                    ],
                ),
            ],
        ),
        ApiResponse(
            responseCode = "401",
            description = "Missing, expired, or revoked session",
            content = [
                Content(
                    mediaType = "application/json",
                    examples = [ExampleObject(name = "error", value = """{"error":"Invalid or expired session"}""")],
                ),
            ],
        ),
    )
    fun me(@RequestHeader(value = "Authorization", required = false) authorization: String?): UserDto =
        authService.me(authorization)

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Revoke the current session")
    @ApiResponses(
        ApiResponse(responseCode = "204", description = "Session deleted"),
        ApiResponse(
            responseCode = "401",
            description = "Missing bearer token",
            content = [
                Content(
                    mediaType = "application/json",
                    examples = [ExampleObject(name = "error", value = """{"error":"Missing session"}""")],
                ),
            ],
        ),
    )
    fun logout(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        httpRequest: HttpServletRequest,
    ) {
        authService.logout(authorization, clientIp(httpRequest), httpRequest.getHeader("User-Agent"))
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
        httpRequest: HttpServletRequest,
    ) {
        authService.revokeSession(authorization, sessionId, clientIp(httpRequest), httpRequest.getHeader("User-Agent"))
    }

    @DeleteMapping("/sessions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revokeAllSessions(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        httpRequest: HttpServletRequest,
    ) {
        authService.revokeAllSessions(authorization, clientIp(httpRequest), httpRequest.getHeader("User-Agent"))
    }

    @PostMapping("/login/mfa")
    @Operation(summary = "Complete login with TOTP or a recovery code")
    fun completeMfaLogin(
        @RequestBody request: MfaLoginRequest,
        httpRequest: HttpServletRequest,
    ): LoginResponse =
        authService.completeMfaLogin(
            challengeToken = request.challengeToken,
            code = request.code,
            recoveryCode = request.recoveryCode,
            clientIp = clientIp(httpRequest),
            userAgent = httpRequest.getHeader("User-Agent"),
        )

    @PostMapping("/mfa/enroll/start")
    @Operation(summary = "Begin TOTP enrollment")
    fun startEnroll(
        @RequestBody(required = false) request: MfaEnrollStartRequest?,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): MfaEnrollStartDto =
        authService.startEnroll(
            authorization,
            request?.challengeToken,
            clientIp(httpRequest),
            httpRequest.getHeader("User-Agent"),
        )

    @PostMapping("/mfa/enroll/confirm")
    @Operation(summary = "Confirm TOTP enrollment and issue recovery codes")
    fun confirmEnroll(
        @RequestBody request: MfaEnrollConfirmRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): MfaEnrollConfirmDto =
        authService.confirmEnroll(
            authorization,
            request.challengeToken,
            request.code,
            clientIp(httpRequest),
            httpRequest.getHeader("User-Agent"),
        )

    @PostMapping("/mfa/step-up")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Refresh step-up authentication with TOTP")
    fun stepUp(
        @RequestBody request: MfaCodeRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ) {
        authService.stepUp(authorization, request.code, clientIp(httpRequest), httpRequest.getHeader("User-Agent"))
    }

    @PostMapping("/mfa/recovery/regenerate")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Replace recovery codes after TOTP verification")
    fun regenerateRecovery(
        @RequestBody request: MfaCodeRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): MfaRecoveryDto =
        authService.regenerateRecovery(
            authorization,
            request.code,
            clientIp(httpRequest),
            httpRequest.getHeader("User-Agent"),
        )

    @DeleteMapping("/mfa")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Revoke enrolled MFA")
    fun revokeMfa(
        @RequestBody request: MfaCodeRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ) {
        authService.revokeMfa(authorization, request.code, clientIp(httpRequest), httpRequest.getHeader("User-Agent"))
    }

    private fun clientIp(request: HttpServletRequest): String {
        val forwarded = request.getHeader("X-Forwarded-For")?.split(",")?.firstOrNull()?.trim()
        return forwarded?.ifBlank { null } ?: request.remoteAddr ?: "unknown"
    }
}

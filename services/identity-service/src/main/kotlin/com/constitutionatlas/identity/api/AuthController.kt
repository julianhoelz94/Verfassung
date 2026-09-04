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
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

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
                    schema = Schema(implementation = SessionDto::class),
                    examples = [
                        ExampleObject(
                            name = "session",
                            value = """{"token":"opaque-session-token","user":{"id":"01900000-0000-4000-8000-000000000410","email":"local-editor@example.local","roles":["editor","publisher","reviewer"]}}""",
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
    fun login(@RequestBody request: LoginRequest): SessionDto =
        authService.login(request.email, request.password)

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
                            value = """{"id":"01900000-0000-4000-8000-000000000410","email":"local-editor@example.local","roles":["editor","publisher","reviewer"]}""",
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
    fun logout(@RequestHeader(value = "Authorization", required = false) authorization: String?) {
        authService.logout(authorization)
    }
}

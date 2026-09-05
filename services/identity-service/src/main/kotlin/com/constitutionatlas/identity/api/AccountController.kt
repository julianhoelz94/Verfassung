package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.AccountService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@Tag(name = "Accounts")
class AccountController(private val accountService: AccountService) {
    @GetMapping("/users")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "List users (admin)")
    fun listUsers(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<UserAdminDto> = accountService.listUsers(authorization)

    @GetMapping("/users/{userId}")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Inspect a user (admin)")
    fun getUser(
        @PathVariable userId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): UserAdminDto = accountService.getUser(authorization, userId)

    @PostMapping("/users/invites")
    @ResponseStatus(HttpStatus.CREATED)
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Invite a user (admin)")
    fun invite(
        @RequestBody request: InviteRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): InviteCreatedDto =
        accountService.invite(authorization, request, clientIp(httpRequest), userAgent(httpRequest))

    @PostMapping("/users/{userId}/disable")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Disable a user and revoke sessions (admin)")
    fun disable(
        @PathVariable userId: UUID,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): UserAdminDto = accountService.disable(authorization, userId, clientIp(httpRequest), userAgent(httpRequest))

    @PostMapping("/users/{userId}/enable")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Activate a disabled user (admin)")
    fun enable(
        @PathVariable userId: UUID,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): UserAdminDto = accountService.enable(authorization, userId, clientIp(httpRequest), userAgent(httpRequest))

    @PutMapping("/users/{userId}/roles")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Replace user roles (admin)")
    fun updateRoles(
        @PathVariable userId: UUID,
        @RequestBody request: RoleUpdateRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): UserAdminDto =
        accountService.updateRoles(authorization, userId, request.roles, clientIp(httpRequest), userAgent(httpRequest))

    @PostMapping("/users/{userId}/password-resets")
    @ResponseStatus(HttpStatus.CREATED)
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Issue a password reset token (admin)")
    fun issueReset(
        @PathVariable userId: UUID,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): PasswordResetIssuedDto =
        accountService.issuePasswordReset(authorization, userId, clientIp(httpRequest), userAgent(httpRequest))

    @PostMapping("/invites/accept")
    @Operation(summary = "Accept an invite and set a password")
    fun acceptInvite(
        @RequestBody request: InviteAcceptedRequest,
        httpRequest: HttpServletRequest,
    ): UserAdminDto =
        accountService.acceptInvite(request.token, request.password, clientIp(httpRequest), userAgent(httpRequest))

    @PostMapping("/password/change")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Change password for the current user")
    fun changePassword(
        @RequestBody request: PasswordChangeRequest,
        httpRequest: HttpServletRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ) {
        accountService.changePassword(
            authorization,
            request.currentPassword,
            request.newPassword,
            clientIp(httpRequest),
            userAgent(httpRequest),
        )
    }

    @PostMapping("/password/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Request a password reset (always no-content)")
    fun requestReset(
        @RequestBody request: PasswordResetRequest,
        httpRequest: HttpServletRequest,
    ) {
        accountService.requestPasswordReset(request.email, clientIp(httpRequest), userAgent(httpRequest))
    }

    @PostMapping("/password/reset/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Confirm a password reset")
    fun confirmReset(
        @RequestBody request: PasswordResetConfirmRequest,
        httpRequest: HttpServletRequest,
    ) {
        accountService.confirmPasswordReset(
            request.token,
            request.newPassword,
            clientIp(httpRequest),
            userAgent(httpRequest),
        )
    }

    private fun clientIp(request: HttpServletRequest): String {
        val forwarded = request.getHeader("X-Forwarded-For")?.split(",")?.firstOrNull()?.trim()
        return forwarded?.ifBlank { null } ?: request.remoteAddr ?: "unknown"
    }

    private fun userAgent(request: HttpServletRequest): String? = request.getHeader("User-Agent")
}

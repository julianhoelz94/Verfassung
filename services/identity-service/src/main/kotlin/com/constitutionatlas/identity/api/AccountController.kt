package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.MailDeliveryException
import com.constitutionatlas.identity.mail.OutboundMailer
import com.constitutionatlas.identity.service.AccountService
import com.constitutionatlas.identity.service.IdentitySettingsService
import com.constitutionatlas.identity.service.ServiceTokenService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
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
class AccountController(
    private val accountService: AccountService,
    private val serviceTokenService: ServiceTokenService,
    private val settingsService: IdentitySettingsService,
    private val outboundMailer: OutboundMailer,
) {
    @GetMapping("/registration/status")
    fun registrationStatus(): Map<String, Boolean> = settingsService.publicRegistrationStatus()

    @PostMapping("/registration")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun register(@RequestBody request: RegistrationRequest, httpRequest: HttpServletRequest) {
        try {
            accountService.register(request.email, clientIp(httpRequest), userAgent(httpRequest))
        } catch (_: MailDeliveryException) {
            // Keep the same response for existing and new addresses, including a delivery outage.
        }
    }

    @PostMapping("/registration/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun confirmRegistration(@RequestBody request: RegistrationConfirmRequest, httpRequest: HttpServletRequest) {
        accountService.confirmRegistration(request.token, request.password, clientIp(httpRequest), userAgent(httpRequest))
    }

    @GetMapping("/admin/settings")
    fun settings(@RequestHeader(value = "Authorization", required = false) authorization: String?): IdentitySettingsDto =
        settingsService.read(authorization)

    @PutMapping("/admin/settings")
    fun updateSettings(
        @RequestBody request: UpdateIdentitySettingsRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): IdentitySettingsDto = settingsService.update(authorization, request)

    @PostMapping("/admin/settings/test-mail")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun testMail(
        @RequestBody request: TestMailRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ) {
        settingsService.testMail(authorization, request.to, outboundMailer)
    }

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

    @GetMapping("/service-tokens")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "List machine tokens (admin)")
    fun listServiceTokens(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<ServiceTokenDto> = serviceTokenService.list(authorization)

    @PostMapping("/service-tokens")
    @ResponseStatus(HttpStatus.CREATED)
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Issue a rotatable machine token (admin)")
    fun createServiceToken(
        @RequestBody request: CreateServiceTokenRequest,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): ServiceTokenCreatedDto = serviceTokenService.create(authorization, request)

    @DeleteMapping("/service-tokens/{tokenId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Revoke a machine token (admin)")
    fun revokeServiceToken(
        @PathVariable tokenId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ) {
        serviceTokenService.revoke(authorization, tokenId)
    }

    @PostMapping("/service-tokens/{tokenId}/rotate")
    @SecurityRequirement(name = "bearer-session")
    @Operation(summary = "Rotate a machine token (admin)")
    fun rotateServiceToken(
        @PathVariable tokenId: UUID,
        @RequestBody(required = false) request: RotateServiceTokenRequest?,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): ServiceTokenCreatedDto = serviceTokenService.rotate(authorization, tokenId, request)

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

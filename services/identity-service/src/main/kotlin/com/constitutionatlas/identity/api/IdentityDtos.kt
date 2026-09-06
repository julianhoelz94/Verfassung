package com.constitutionatlas.identity.api

import com.fasterxml.jackson.annotation.JsonInclude
import java.time.OffsetDateTime
import java.util.UUID

data class LoginRequest(
    val email: String,
    val password: String,
)

data class UserDto(
    val id: UUID,
    val email: String,
    val roles: List<String>,
    val mfaEnabled: Boolean = false,
    val mfaRequired: Boolean = false,
    val stepUpFresh: Boolean = false,
)

data class SessionDto(
    val token: String,
    val user: UserDto,
    val expiresInSeconds: Long,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class LoginResponse(
    val token: String? = null,
    val user: UserDto,
    val expiresInSeconds: Long? = null,
    val mfaRequired: Boolean = false,
    val mfaEnrollmentRequired: Boolean = false,
    val challengeToken: String? = null,
)

data class MfaLoginRequest(
    val challengeToken: String,
    val code: String? = null,
    val recoveryCode: String? = null,
)

data class MfaEnrollStartRequest(
    val challengeToken: String? = null,
)

data class MfaEnrollStartDto(
    val secret: String,
    val otpauthUrl: String,
    val challengeToken: String,
)

data class MfaEnrollConfirmRequest(
    val code: String,
    val challengeToken: String? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class MfaEnrollConfirmDto(
    val recoveryCodes: List<String>,
    val token: String? = null,
    val user: UserDto? = null,
    val expiresInSeconds: Long? = null,
)

data class MfaCodeRequest(
    val code: String,
)

data class MfaRecoveryDto(
    val recoveryCodes: List<String>,
)

data class SessionInfoDto(
    val id: UUID,
    val createdAt: OffsetDateTime,
    val lastSeenAt: OffsetDateTime,
    val current: Boolean,
)

data class InviteRequest(
    val email: String,
    val roles: List<String> = listOf("viewer"),
)

data class InviteAcceptedRequest(
    val token: String,
    val password: String,
)

data class InviteCreatedDto(
    val user: UserAdminDto,
    val inviteToken: String,
    val expiresAt: OffsetDateTime,
)

data class UserAdminDto(
    val id: UUID,
    val email: String,
    val roles: List<String>,
    val enabled: Boolean,
    val status: String,
    val createdAt: OffsetDateTime,
)

data class RoleUpdateRequest(
    val roles: List<String>,
)

data class PasswordChangeRequest(
    val currentPassword: String,
    val newPassword: String,
)

data class PasswordResetRequest(
    val email: String,
)

data class PasswordResetConfirmRequest(
    val token: String,
    val newPassword: String,
)

data class PasswordResetIssuedDto(
    val resetToken: String,
    val expiresAt: OffsetDateTime,
)

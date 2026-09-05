package com.constitutionatlas.identity.api

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
)

data class SessionDto(
    val token: String,
    val user: UserDto,
    val expiresInSeconds: Long,
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

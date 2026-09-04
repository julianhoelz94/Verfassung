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

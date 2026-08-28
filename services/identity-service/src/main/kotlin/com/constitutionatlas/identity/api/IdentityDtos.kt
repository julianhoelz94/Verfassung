package com.constitutionatlas.identity.api

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
)

package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.UnauthorizedException
import com.constitutionatlas.identity.api.SessionDto
import com.constitutionatlas.identity.api.UserDto
import com.constitutionatlas.identity.repo.IdentityRepository
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.OffsetDateTime
import java.util.HexFormat
import java.util.UUID

@Service
class AuthService(
    private val identityRepository: IdentityRepository,
    private val passwordEncoder: PasswordEncoder,
) {
    fun login(email: String, password: String): SessionDto {
        val user = identityRepository.findUserByEmail(email.trim())
            ?: throw UnauthorizedException("Invalid credentials")
        if (!user.enabled || !passwordEncoder.matches(password, user.passwordHash)) {
            throw UnauthorizedException("Invalid credentials")
        }
        val token = UUID.randomUUID().toString() + UUID.randomUUID().toString().replace("-", "")
        identityRepository.insertSession(user.id, sha256(token), OffsetDateTime.now().plusHours(24))
        return SessionDto(token, identityRepository.toUserDto(user))
    }

    fun me(bearerToken: String?): UserDto {
        val user = identityRepository.findUserByValidTokenHash(sha256(requireToken(bearerToken)))
            ?: throw UnauthorizedException("Invalid or expired session")
        return identityRepository.toUserDto(user)
    }

    fun logout(bearerToken: String?) {
        identityRepository.deleteSessionByTokenHash(sha256(requireToken(bearerToken)))
    }

    private fun requireToken(authorization: String?): String {
        val value = authorization?.trim().orEmpty()
        if (!value.startsWith("Bearer ")) {
            throw UnauthorizedException("Missing session")
        }
        return value.removePrefix("Bearer ").trim().ifBlank {
            throw UnauthorizedException("Missing session")
        }
    }

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }
}

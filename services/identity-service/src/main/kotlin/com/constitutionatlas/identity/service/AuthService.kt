package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.TooManyRequestsException
import com.constitutionatlas.identity.UnauthorizedException
import com.constitutionatlas.identity.api.SessionDto
import com.constitutionatlas.identity.api.SessionInfoDto
import com.constitutionatlas.identity.api.UserDto
import com.constitutionatlas.identity.config.IdentityLoginProperties
import com.constitutionatlas.identity.config.IdentitySessionProperties
import com.constitutionatlas.identity.repo.IdentityRepository
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

@Service
class AuthService(
    private val identityRepository: IdentityRepository,
    private val passwordEncoder: PasswordEncoder,
    private val sessionProperties: IdentitySessionProperties,
    private val loginProperties: IdentityLoginProperties,
    meterRegistry: MeterRegistry,
) {
    private val random = SecureRandom()
    private val dummyHash: String = passwordEncoder.encode("identity-timing-dummy")
    private val loginAttempts = meterRegistry.counter("identity.login.attempts")
    private val loginFailures = meterRegistry.counter("identity.login.failures")
    private val loginLockouts = meterRegistry.counter("identity.login.lockouts")

    fun login(email: String, password: String, clientIp: String, existingAuthorization: String?): SessionDto {
        val normalized = email.trim().lowercase()
        val ipKey = "ip:${clientIp.ifBlank { "unknown" }}"
        val emailKey = "email:$normalized"
        rejectIfLocked(emailKey)
        rejectIfLocked(ipKey)

        val user = identityRepository.findUserByEmail(normalized)
        val matches = passwordEncoder.matches(password, user?.passwordHash ?: dummyHash)
        if (user == null || !matches) {
            loginAttempts.increment()
            loginFailures.increment()
            recordFailure(emailKey)
            recordFailure(ipKey)
            throw UnauthorizedException("Invalid credentials")
        }

        identityRepository.clearThrottle(emailKey)
        identityRepository.clearThrottle(ipKey)
        loginAttempts.increment()
        existingAuthorization?.let { token ->
            runCatching { identityRepository.deleteSessionByTokenHash(sha256(requireToken(token))) }
        }
        purgeExpired()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val expiresAt = now.plus(sessionProperties.absoluteTimeout)
        val token = newSessionToken()
        identityRepository.insertSession(user.id, sha256(token), expiresAt, now)
        return SessionDto(
            token = token,
            user = identityRepository.toUserDto(user),
            expiresInSeconds = sessionProperties.absoluteTimeout.seconds,
        )
    }

    fun me(bearerToken: String?): UserDto {
        val token = requireToken(bearerToken)
        val hash = sha256(token)
        val user = requireActiveSession(hash)
        identityRepository.touchSession(hash)
        return identityRepository.toUserDto(user)
    }

    fun logout(bearerToken: String?) {
        identityRepository.deleteSessionByTokenHash(sha256(requireToken(bearerToken)))
    }

    fun listSessions(bearerToken: String?): List<SessionInfoDto> {
        val token = requireToken(bearerToken)
        val hash = sha256(token)
        val user = requireActiveSession(hash)
        return identityRepository.listSessions(user.id, hash)
    }

    fun revokeSession(bearerToken: String?, sessionId: UUID) {
        val user = requireActiveSession(sha256(requireToken(bearerToken)))
        if (!identityRepository.sessionBelongsToUser(sessionId, user.id)) {
            throw UnauthorizedException("Invalid or expired session")
        }
        identityRepository.deleteSessionById(sessionId)
    }

    fun revokeAllSessions(bearerToken: String?) {
        val user = requireActiveSession(sha256(requireToken(bearerToken)))
        identityRepository.deleteSessionsForUser(user.id)
    }

    fun purgeExpired() {
        val idleCutoff = Instant.now().minus(sessionProperties.idleTimeout)
        identityRepository.deleteExpiredSessions(idleCutoff)
    }

    private fun requireActiveSession(tokenHash: String) =
        identityRepository.findUserByValidTokenHash(tokenHash)?.also {
            val lastSeen = identityRepository.lastSeenAt(tokenHash) ?: throw UnauthorizedException("Invalid or expired session")
            if (lastSeen.isBefore(Instant.now().minus(sessionProperties.idleTimeout))) {
                identityRepository.deleteSessionByTokenHash(tokenHash)
                throw UnauthorizedException("Invalid or expired session")
            }
        } ?: throw UnauthorizedException("Invalid or expired session")

    private fun rejectIfLocked(key: String) {
        val throttle = identityRepository.findThrottle(key) ?: return
        val lockedUntil = throttle.lockedUntil ?: return
        if (lockedUntil.isAfter(Instant.now())) {
            loginLockouts.increment()
            throw TooManyRequestsException()
        }
    }

    private fun recordFailure(key: String) {
        val existing = identityRepository.findThrottle(key)
        val failures = (existing?.failureCount ?: 0) + 1
        val lockedUntil =
            if (failures >= loginProperties.failureThreshold) {
                val index =
                    ((failures - loginProperties.failureThreshold) / loginProperties.failureThreshold)
                        .coerceAtMost(loginProperties.lockouts.lastIndex)
                Instant.now().plus(loginProperties.lockouts[index])
            } else {
                null
            }
        identityRepository.upsertThrottle(key, failures, lockedUntil)
    }

    private fun newSessionToken(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
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

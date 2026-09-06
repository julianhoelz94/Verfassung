package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.ConflictException
import com.constitutionatlas.identity.StepUpRequiredException
import com.constitutionatlas.identity.TooManyRequestsException
import com.constitutionatlas.identity.UnauthorizedException
import com.constitutionatlas.identity.api.LoginResponse
import com.constitutionatlas.identity.api.MfaEnrollConfirmDto
import com.constitutionatlas.identity.api.MfaEnrollStartDto
import com.constitutionatlas.identity.api.MfaRecoveryDto
import com.constitutionatlas.identity.api.SessionInfoDto
import com.constitutionatlas.identity.api.UserDto
import com.constitutionatlas.identity.client.AuthAudit
import com.constitutionatlas.identity.config.IdentityLoginProperties
import com.constitutionatlas.identity.config.IdentityMfaProperties
import com.constitutionatlas.identity.config.IdentitySessionProperties
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.crypto.Totp
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.StoredUser
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Service
class AuthService(
    private val identityRepository: IdentityRepository,
    private val passwordEncoder: PasswordEncoder,
    private val sessionProperties: IdentitySessionProperties,
    private val loginProperties: IdentityLoginProperties,
    private val mfaProperties: IdentityMfaProperties,
    private val mfaService: MfaService,
    private val authAudit: AuthAudit,
    meterRegistry: MeterRegistry,
) {
    private val random = SecureRandom()
    private val dummyHash: String = passwordEncoder.encode("identity-timing-dummy")
    private val loginAttempts = meterRegistry.counter("identity.login.attempts")
    private val loginFailures = meterRegistry.counter("identity.login.failures")
    private val loginLockouts = meterRegistry.counter("identity.login.lockouts")

    fun login(
        email: String,
        password: String,
        clientIp: String,
        userAgent: String?,
        existingAuthorization: String?,
    ): LoginResponse {
        val normalized = email.trim().lowercase()
        val ipKey = "ip:${clientIp.ifBlank { "unknown" }}"
        val emailKey = "email:$normalized"
        rejectIfLocked(emailKey)
        rejectIfLocked(ipKey)

        val user = identityRepository.findUserByEmail(normalized)
        val matches = passwordEncoder.matches(password, user?.passwordHash ?: dummyHash)
        if (user == null || !user.enabled || !matches) {
            loginAttempts.increment()
            loginFailures.increment()
            recordFailure(emailKey)
            recordFailure(ipKey)
            authAudit.record(
                "login_failed",
                user?.id ?: UNKNOWN_ACTOR,
                user?.id,
                user?.email,
                clientIp,
                userAgent,
            )
            throw UnauthorizedException("Invalid credentials")
        }

        identityRepository.clearThrottle(emailKey)
        identityRepository.clearThrottle(ipKey)
        loginAttempts.increment()
        val revokeHash = existingAuthorization?.let { token ->
            runCatching { Tokens.sha256Hex(Tokens.requireBearer(token)) }.getOrNull()
        }
        val dto = identityRepository.toUserDto(user)
        if (dto.mfaRequired && !dto.mfaEnabled) {
            val challenge = mfaService.createChallenge(user.id, "enroll", revokeHash)
            return LoginResponse(
                user = dto,
                mfaEnrollmentRequired = true,
                challengeToken = challenge,
            )
        }
        if (dto.mfaEnabled) {
            val challenge = mfaService.createChallenge(user.id, "login", revokeHash)
            return LoginResponse(
                user = dto,
                mfaRequired = true,
                challengeToken = challenge,
            )
        }
        return issueSession(user, clientIp, userAgent, mfaVerified = false, revokeTokenHash = revokeHash)
    }

    fun completeMfaLogin(
        challengeToken: String,
        code: String?,
        recoveryCode: String?,
        clientIp: String,
        userAgent: String?,
    ): LoginResponse {
        val challenge = mfaService.requireChallenge(challengeToken, "login")
        val user =
            identityRepository.findUserById(challenge.userId)
                ?: throw UnauthorizedException("Invalid credentials")
        if (!user.enabled) {
            throw UnauthorizedException("Invalid credentials")
        }
        val totpOk = !code.isNullOrBlank() && mfaService.verifyEnrolledTotp(user.id, code)
        val recoveryOk =
            !totpOk &&
                !recoveryCode.isNullOrBlank() &&
                mfaService.useRecoveryCode(user.id, recoveryCode, clientIp, userAgent, user.email)
        if (!totpOk && !recoveryOk) {
            authAudit.record("login_failed", user.id, user.id, user.email, clientIp, userAgent)
            throw UnauthorizedException("Invalid credentials")
        }
        identityRepository.deleteChallenge(challenge.id)
        return issueSession(
            user,
            clientIp,
            userAgent,
            mfaVerified = true,
            revokeTokenHash = challenge.revokeTokenHash,
        )
    }

    fun startEnroll(
        authorization: String?,
        challengeToken: String?,
        clientIp: String,
        userAgent: String?,
    ): MfaEnrollStartDto {
        val (user, token) = enrollActor(authorization, challengeToken)
        val (secret, issuedToken) = mfaService.startEnroll(user.id, token)
        authAudit.recordMfaChange(user.id, user.email, clientIp, userAgent, mapOf("kind" to "enroll_started"))
        return MfaEnrollStartDto(
            secret = secret,
            otpauthUrl = mfaService.otpauthUrl(user.email, secret),
            challengeToken = issuedToken,
        )
    }

    fun confirmEnroll(
        authorization: String?,
        challengeToken: String?,
        code: String,
        clientIp: String,
        userAgent: String?,
    ): MfaEnrollConfirmDto {
        val token = challengeToken?.trim().orEmpty().ifBlank { null }
        val challenge = mfaService.requireChallenge(token ?: "", "enroll")
        val user =
            identityRepository.findUserById(challenge.userId)
                ?: throw UnauthorizedException("Invalid credentials")
        if (authorization != null) {
            val sessionUser = requireActiveSession(Tokens.sha256Hex(Tokens.requireBearer(authorization)))
            if (sessionUser.id != user.id) {
                throw UnauthorizedException("Invalid or expired session")
            }
        }
        val secret = mfaService.pendingSecret(challenge)
        if (!Totp.matches(secret, code)) {
            throw UnauthorizedException("Invalid credentials")
        }
        val recovery = mfaService.enrollConfirmed(user.id, secret)
        identityRepository.deleteChallenge(challenge.id)
        authAudit.recordMfaChange(user.id, user.email, clientIp, userAgent, mapOf("kind" to "enrolled"))
        val session =
            if (authorization == null) {
                issueSession(
                    user,
                    clientIp,
                    userAgent,
                    mfaVerified = true,
                    revokeTokenHash = challenge.revokeTokenHash,
                )
            } else {
                val hash = Tokens.sha256Hex(Tokens.requireBearer(authorization))
                identityRepository.markSessionMfa(hash, Instant.now())
                null
            }
        return MfaEnrollConfirmDto(
            recoveryCodes = recovery,
            token = session?.token,
            user = session?.user ?: identityRepository.toUserDto(user, null, mfaProperties.stepUpTtl),
            expiresInSeconds = session?.expiresInSeconds,
        )
    }

    fun stepUp(
        authorization: String?,
        code: String,
        clientIp: String,
        userAgent: String?,
    ) {
        val hash = Tokens.sha256Hex(Tokens.requireBearer(authorization))
        val user = requireActiveSession(hash)
        if (!mfaService.verifyEnrolledTotp(user.id, code)) {
            throw UnauthorizedException("Invalid credentials")
        }
        identityRepository.markSessionMfa(hash, Instant.now())
        authAudit.recordMfaChange(user.id, user.email, clientIp, userAgent, mapOf("kind" to "step_up"))
    }

    fun revokeMfa(
        authorization: String?,
        code: String,
        clientIp: String,
        userAgent: String?,
    ) {
        val user = requireActiveSession(Tokens.sha256Hex(Tokens.requireBearer(authorization)))
        if (identityRepository.toUserDto(user).mfaRequired) {
            throw ConflictException("MFA is required for this account")
        }
        if (!mfaService.verifyEnrolledTotp(user.id, code)) {
            throw UnauthorizedException("Invalid credentials")
        }
        mfaService.revoke(user.id)
        authAudit.recordMfaChange(user.id, user.email, clientIp, userAgent, mapOf("kind" to "revoked"))
    }

    fun regenerateRecovery(
        authorization: String?,
        code: String,
        clientIp: String,
        userAgent: String?,
    ): MfaRecoveryDto {
        val user = requireActiveSession(Tokens.sha256Hex(Tokens.requireBearer(authorization)))
        if (!mfaService.verifyEnrolledTotp(user.id, code)) {
            throw UnauthorizedException("Invalid credentials")
        }
        val codes = mfaService.replaceRecoveryCodes(user.id)
        authAudit.recordMfaChange(user.id, user.email, clientIp, userAgent, mapOf("kind" to "recovery_rotated"))
        return MfaRecoveryDto(codes)
    }

    fun me(bearerToken: String?): UserDto {
        val token = Tokens.requireBearer(bearerToken)
        val hash = Tokens.sha256Hex(token)
        val user = requireActiveSession(hash)
        identityRepository.touchSession(hash)
        return identityRepository.toUserDto(user, hash, mfaProperties.stepUpTtl)
    }

    fun logout(bearerToken: String?, clientIp: String, userAgent: String?) {
        val hash = Tokens.sha256Hex(Tokens.requireBearer(bearerToken))
        val user = identityRepository.findUserByValidTokenHash(hash)
        identityRepository.deleteSessionByTokenHash(hash)
        if (user != null) {
            authAudit.record("logout", user.id, user.id, user.email, clientIp, userAgent)
        }
    }

    fun listSessions(bearerToken: String?): List<SessionInfoDto> {
        val token = Tokens.requireBearer(bearerToken)
        val hash = Tokens.sha256Hex(token)
        val user = requireActiveSession(hash)
        return identityRepository.listSessions(user.id, hash)
    }

    fun revokeSession(bearerToken: String?, sessionId: UUID, clientIp: String, userAgent: String?) {
        val user = requireActiveSession(Tokens.sha256Hex(Tokens.requireBearer(bearerToken)))
        if (!identityRepository.sessionBelongsToUser(sessionId, user.id)) {
            throw UnauthorizedException("Invalid or expired session")
        }
        identityRepository.deleteSessionById(sessionId)
        authAudit.record("session_revoked", user.id, user.id, user.email, clientIp, userAgent)
    }

    fun revokeAllSessions(bearerToken: String?, clientIp: String, userAgent: String?) {
        val user = requireActiveSession(Tokens.sha256Hex(Tokens.requireBearer(bearerToken)))
        identityRepository.deleteSessionsForUser(user.id)
        authAudit.record("session_revoked", user.id, user.id, user.email, clientIp, userAgent, mapOf("scope" to "all"))
    }

    fun purgeExpired() {
        val idleCutoff = Instant.now().minus(sessionProperties.idleTimeout)
        identityRepository.deleteExpiredSessions(idleCutoff)
    }

    fun requireFreshStepUp(authorization: String?): StoredUser {
        val hash = Tokens.sha256Hex(Tokens.requireBearer(authorization))
        val user = requireActiveSession(hash)
        val dto = identityRepository.toUserDto(user, hash, mfaProperties.stepUpTtl)
        if (!dto.stepUpFresh) {
            throw StepUpRequiredException()
        }
        return user
    }

    private fun issueSession(
        user: StoredUser,
        clientIp: String,
        userAgent: String?,
        mfaVerified: Boolean,
        revokeTokenHash: String?,
    ): LoginResponse {
        if (!revokeTokenHash.isNullOrBlank()) {
            identityRepository.deleteSessionByTokenHash(revokeTokenHash)
        }
        purgeExpired()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val expiresAt = now.plus(sessionProperties.absoluteTimeout)
        val token = Tokens.urlToken(random)
        val hash = Tokens.sha256Hex(token)
        identityRepository.insertSession(
            user.id,
            hash,
            expiresAt,
            now,
            mfaVerifiedAt = if (mfaVerified) now else null,
            stepUpAt = now,
        )
        authAudit.record("login_succeeded", user.id, user.id, user.email, clientIp, userAgent)
        return LoginResponse(
            token = token,
            user = identityRepository.toUserDto(user, hash, mfaProperties.stepUpTtl),
            expiresInSeconds = sessionProperties.absoluteTimeout.seconds,
        )
    }

    private fun enrollActor(
        authorization: String?,
        challengeToken: String?,
    ): Pair<StoredUser, String?> {
        if (!challengeToken.isNullOrBlank()) {
            val challenge = mfaService.requireChallenge(challengeToken, "enroll")
            val user =
                identityRepository.findUserById(challenge.userId)
                    ?: throw UnauthorizedException("Invalid credentials")
            return user to challengeToken
        }
        val user = requireActiveSession(Tokens.sha256Hex(Tokens.requireBearer(authorization)))
        return user to null
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

    companion object {
        private val UNKNOWN_ACTOR = UUID.fromString("00000000-0000-4000-8000-000000000000")
    }
}

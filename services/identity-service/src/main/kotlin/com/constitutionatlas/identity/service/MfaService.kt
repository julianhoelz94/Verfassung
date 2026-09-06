package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.ConflictException
import com.constitutionatlas.identity.UnauthorizedException
import com.constitutionatlas.identity.client.AuthAudit
import com.constitutionatlas.identity.config.IdentityMfaProperties
import com.constitutionatlas.identity.crypto.Base32
import com.constitutionatlas.identity.crypto.SecretBox
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.crypto.Totp
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.StoredMfaChallenge
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.time.Instant
import java.util.UUID

@Service
class MfaService(
    private val identityRepository: IdentityRepository,
    private val mfaProperties: IdentityMfaProperties,
    private val authAudit: AuthAudit,
) {
    private val random = SecureRandom()
    private val box = SecretBox(mfaProperties.encryptionKey, random)

    fun createChallenge(
        userId: UUID,
        purpose: String,
        revokeTokenHash: String? = null,
    ): String {
        identityRepository.deleteChallengesForUser(userId, purpose)
        val token = Tokens.urlToken(random)
        identityRepository.insertChallenge(
            userId = userId,
            tokenHash = Tokens.sha256Hex(token),
            purpose = purpose,
            expiresAt = Instant.now().plus(mfaProperties.challengeTtl),
            revokeTokenHash = revokeTokenHash,
        )
        return token
    }

    fun requireChallenge(token: String, purpose: String): StoredMfaChallenge {
        val challenge =
            identityRepository.findChallengeByTokenHash(Tokens.sha256Hex(token.trim()))
                ?: throw UnauthorizedException("Invalid credentials")
        if (challenge.purpose != purpose || challenge.expiresAt.isBefore(Instant.now())) {
            identityRepository.deleteChallenge(challenge.id)
            throw UnauthorizedException("Invalid credentials")
        }
        return challenge
    }

    fun verifyEnrolledTotp(userId: UUID, code: String): Boolean {
        val cipher = identityRepository.findMfaSecretCipher(userId) ?: return false
        return Totp.matches(box.decrypt(cipher), code)
    }

    fun useRecoveryCode(
        userId: UUID,
        recoveryCode: String,
        clientIp: String,
        userAgent: String?,
        email: String,
    ): Boolean {
        val hash = Tokens.sha256Hex(normalizeRecovery(recoveryCode))
        val id = identityRepository.findUnusedRecovery(hash) ?: return false
        if (!identityRepository.recoveryBelongsToUser(id, userId)) {
            return false
        }
        identityRepository.markRecoveryUsed(id)
        authAudit.recordMfaChange(userId, email, clientIp, userAgent, mapOf("kind" to "recovery_used"))
        return true
    }

    fun startEnroll(userId: UUID, existingChallengeToken: String?): Pair<String, String> {
        if (identityRepository.mfaEnabled(userId)) {
            throw ConflictException("MFA is already enrolled")
        }
        val (challenge, token) =
            if (existingChallengeToken.isNullOrBlank()) {
                val issued = createChallenge(userId, "enroll")
                identityRepository.findChallengeByTokenHash(Tokens.sha256Hex(issued))!! to issued
            } else {
                requireChallenge(existingChallengeToken, "enroll") to existingChallengeToken
            }
        val pending = challenge.pendingSecretCipher
        if (!pending.isNullOrBlank()) {
            return box.decrypt(pending) to token
        }
        val secretBytes = ByteArray(20)
        random.nextBytes(secretBytes)
        val secret = Base32.encode(secretBytes)
        identityRepository.setChallengePendingSecret(challenge.id, box.encrypt(secret))
        return secret to token
    }

    fun pendingSecret(challenge: StoredMfaChallenge): String {
        val cipher = challenge.pendingSecretCipher ?: throw BadRequestException("MFA enrollment has not started")
        return box.decrypt(cipher)
    }

    fun enrollConfirmed(userId: UUID, secret: String): List<String> {
        identityRepository.upsertMfaSecret(userId, box.encrypt(secret))
        return replaceRecoveryCodes(userId)
    }

    fun ensureSeedTotp(userId: UUID, secretBase32: String) {
        if (identityRepository.mfaEnabled(userId)) {
            return
        }
        identityRepository.upsertMfaSecret(userId, box.encrypt(secretBase32.trim().uppercase()))
    }

    fun replaceRecoveryCodes(userId: UUID): List<String> {
        identityRepository.deleteRecoveryCodes(userId)
        val codes = (1..10).map { newRecoveryCode() }
        codes.forEach { code -> identityRepository.insertRecoveryCode(userId, Tokens.sha256Hex(code)) }
        return codes.map(::formatRecovery)
    }

    fun revoke(userId: UUID) {
        identityRepository.deleteMfa(userId)
        identityRepository.deleteChallengesForUser(userId)
        identityRepository.clearSessionMfa(userId)
    }

    fun otpauthUrl(email: String, secret: String): String =
        Totp.otpauthUrl(mfaProperties.issuer, email, secret)

    fun hashToken(value: String): String = Tokens.sha256Hex(value)

    private fun newRecoveryCode(): String {
        val alphabet = "abcdefghijkmnpqrstuvwxyz23456789"
        val chars = CharArray(10) { alphabet[random.nextInt(alphabet.length)] }
        return String(chars)
    }

    private fun formatRecovery(code: String): String = "${code.substring(0, 5)}-${code.substring(5)}"

    private fun normalizeRecovery(code: String): String =
        code.lowercase().replace("-", "").replace(" ", "")
}

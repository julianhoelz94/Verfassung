package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.api.LoginResponse
import com.constitutionatlas.identity.client.AuthAudit
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.PasskeyRepository
import com.constitutionatlas.identity.repo.StoredUser
import com.constitutionatlas.platform.UnauthorizedException
import com.yubico.webauthn.AssertionRequest
import com.yubico.webauthn.FinishAssertionOptions
import com.yubico.webauthn.FinishRegistrationOptions
import com.yubico.webauthn.RelyingParty
import com.yubico.webauthn.StartAssertionOptions
import com.yubico.webauthn.StartRegistrationOptions
import com.yubico.webauthn.data.AuthenticatorSelectionCriteria
import com.yubico.webauthn.data.PublicKeyCredential
import com.yubico.webauthn.data.PublicKeyCredentialCreationOptions
import com.yubico.webauthn.data.RelyingPartyIdentity
import com.yubico.webauthn.data.ResidentKeyRequirement
import com.yubico.webauthn.data.UserIdentity
import com.yubico.webauthn.data.UserVerificationRequirement
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.net.URI
import java.nio.ByteBuffer
import java.time.Instant
import java.util.Base64
import java.util.UUID
import com.yubico.webauthn.data.ByteArray as WebAuthnBytes

data class PasskeyStart(val challengeId: UUID, val options: JsonNode)

data class PasskeyInfo(val id: String, val label: String, val createdAt: String, val lastUsedAt: String?)

@Service
class PasskeyService(
    private val repository: PasskeyRepository,
    private val identityRepository: IdentityRepository,
    private val authService: AuthService,
    private val mfaService: MfaService,
    private val mapper: ObjectMapper,
    private val audit: AuthAudit,
    @Value("\${PUBLIC_BASE_URL:http://localhost}") publicBaseUrl: String,
) {
    private val rp: RelyingParty = run {
        val url = URI(publicBaseUrl.trimEnd('/'))
        val origin = "${url.scheme}://${url.authority}"
        val rpId = url.host ?: throw IllegalStateException("PUBLIC_BASE_URL must have a host")
        RelyingParty.builder()
            .identity(RelyingPartyIdentity.builder().id(rpId).name("Constitution Atlas").build())
            .credentialRepository(repository)
            .origins(setOf(origin))
            .build()
    }

    fun list(authorization: String?): List<PasskeyInfo> {
        val user = authService.requireSession(authorization)
        return repository.list(user.id).map {
            PasskeyInfo(Base64.getUrlEncoder().withoutPadding().encodeToString(it.credentialId), it.label, it.createdAt.toString(), it.lastUsedAt?.toString())
        }
    }

    @Transactional(noRollbackFor = [UnauthorizedException::class, com.constitutionatlas.identity.TooManyRequestsException::class])
    fun startEnrollment(authorization: String?, password: String): PasskeyStart {
        val user = authService.requireLockedSession(authorization)
        authService.verifyPassword(user, password)
        if (identityRepository.hasSecondFactor(user.id)) authService.requireFreshStepUp(authorization)
        return enrollmentOptions(user.id, user.email)
    }

    @Transactional
    fun startLoginEnrollment(challengeToken: String): PasskeyStart {
        val challenge = mfaService.requireChallenge(challengeToken, "enroll")
        val user = identityRepository.lockUser(challenge.userId)?.takeIf { it.enabled }
            ?: throw UnauthorizedException("Invalid credentials")
        mfaService.requireChallenge(challengeToken, "enroll")
        if (identityRepository.hasSecondFactor(user.id)) throw UnauthorizedException("Use an existing second factor")
        val throttleKey = "passkey-enroll:${user.id}"
        authService.rejectLocked(throttleKey)
        authService.recordLockedFailure(throttleKey)
        return enrollmentOptions(user.id, user.email)
    }

    private fun enrollmentOptions(userId: UUID, email: String): PasskeyStart {
        val handle = ByteBuffer.allocate(16).putLong(userId.mostSignificantBits).putLong(userId.leastSignificantBits).array()
        val request = rp.startRegistration(
            StartRegistrationOptions.builder()
                .user(UserIdentity.builder().name(email).displayName(email).id(WebAuthnBytes(handle)).build())
                .authenticatorSelection(
                    AuthenticatorSelectionCriteria.builder()
                        .residentKey(ResidentKeyRequirement.REQUIRED)
                        .userVerification(UserVerificationRequirement.REQUIRED)
                        .build(),
                )
                .build(),
        )
        return PasskeyStart(repository.storeChallenge(userId, "enroll", request.toJson()), mapper.readTree(request.toCredentialsCreateJson()))
    }

    @Transactional
    fun finishEnrollment(authorization: String?, challengeId: UUID, credential: JsonNode, label: String) {
        val user = authService.requireLockedSession(authorization)
        if (identityRepository.hasSecondFactor(user.id)) authService.requireFreshStepUp(authorization)
        verifyEnrollment(user.id, challengeId, credential, label)
        val hash = Tokens.sha256Hex(Tokens.requireBearer(authorization))
        identityRepository.deleteOtherSessions(user.id, hash)
        identityRepository.deleteChallengesForUser(user.id)
        identityRepository.markSessionMfa(hash, Instant.now())
    }

    @Transactional
    fun finishLoginEnrollment(challengeToken: String, challengeId: UUID, credential: JsonNode, label: String, clientIp: String, userAgent: String?): LoginResponse {
        val loginChallenge = mfaService.requireChallenge(challengeToken, "enroll")
        val user = identityRepository.lockUser(loginChallenge.userId)?.takeIf { it.enabled }
            ?: throw UnauthorizedException("Invalid credentials")
        mfaService.requireChallenge(challengeToken, "enroll")
        if (identityRepository.hasSecondFactor(user.id)) throw UnauthorizedException("Use an existing second factor")
        verifyEnrollment(user.id, challengeId, credential, label)
        if (!identityRepository.consumeChallenge(loginChallenge.id)) throw UnauthorizedException("Invalid credentials")
        identityRepository.deleteChallengesForUser(user.id)
        identityRepository.deleteSessionsForUser(user.id)
        identityRepository.clearThrottle("passkey-enroll:${user.id}")
        return authService.issuePasskeySession(user, clientIp, userAgent)
    }

    private fun verifyEnrollment(userId: UUID, challengeId: UUID, credential: JsonNode, label: String) {
        val challenge = repository.consumeChallenge(challengeId, "enroll") ?: throw BadRequestException("Passkey challenge expired")
        if (challenge.userId != userId) throw UnauthorizedException("Invalid credentials")
        val request = PublicKeyCredentialCreationOptions.fromJson(challenge.requestJson)
        val response = runCatching { PublicKeyCredential.parseRegistrationResponseJson(credential.toString()) }
            .getOrElse { throw BadRequestException("Invalid passkey response") }
        val result = runCatching { rp.finishRegistration(FinishRegistrationOptions.builder().request(request).response(response).build()) }
            .getOrElse { throw BadRequestException("Passkey verification failed") }
        if (!result.isUserVerified || result.isDiscoverable.orElse(true) == false) throw BadRequestException("A verified passkey is required")
        val safeLabel = label.trim().take(80).ifBlank { "Passkey" }
        repository.insert(userId, result.keyId.id.bytes, result.publicKeyCose.bytes, result.signatureCount, safeLabel)
    }

    fun startLogin(clientIp: String): PasskeyStart {
        val key = "passkey-start-ip:${clientIp.ifBlank { "unknown" }}"
        authService.rejectLocked(key)
        authService.recordLockedFailure(key)
        val request = rp.startAssertion(StartAssertionOptions.builder().userVerification(UserVerificationRequirement.REQUIRED).build())
        return PasskeyStart(repository.storeChallenge(null, "login", request.toJson()), mapper.readTree(request.toCredentialsGetJson()))
    }

    @Transactional
    fun startStepUp(authorization: String?): PasskeyStart {
        val user = authService.requireLockedSession(authorization)
        val key = "passkey-stepup:${user.id}"
        authService.rejectLocked(key)
        authService.recordLockedFailure(key)
        val request = rp.startAssertion(StartAssertionOptions.builder().username(user.email).userVerification(UserVerificationRequirement.REQUIRED).build())
        return PasskeyStart(repository.storeChallenge(user.id, "login", request.toJson()), mapper.readTree(request.toCredentialsGetJson()))
    }

    @Transactional(noRollbackFor = [UnauthorizedException::class, com.constitutionatlas.identity.TooManyRequestsException::class])
    fun finishStepUp(authorization: String?, challengeId: UUID, credential: JsonNode, clientIp: String, userAgent: String?) {
        val user = authService.requireLockedSession(authorization)
        verifiedAssertion(challengeId, credential, clientIp, user.id)
        identityRepository.markSessionMfa(Tokens.sha256Hex(Tokens.requireBearer(authorization)), Instant.now())
        audit.recordMfaChange(user.id, user.email, clientIp, userAgent, mapOf("kind" to "passkey_step_up"))
    }

    @Transactional(noRollbackFor = [UnauthorizedException::class, com.constitutionatlas.identity.TooManyRequestsException::class])
    fun finishLogin(challengeId: UUID, credential: JsonNode, clientIp: String, userAgent: String?): LoginResponse {
        val user = verifiedAssertion(challengeId, credential, clientIp, null)
        return authService.issuePasskeySession(user, clientIp, userAgent)
    }

    private fun verifiedAssertion(challengeId: UUID, credential: JsonNode, clientIp: String, expectedUser: UUID?): StoredUser {
        val key = "passkey-ip:${clientIp.ifBlank { "unknown" }}"
        authService.rejectLocked(key)
        val challenge = repository.consumeChallenge(challengeId, "login") ?: throw UnauthorizedException("Invalid credentials")
        if (challenge.userId != expectedUser) throw UnauthorizedException("Invalid credentials")
        val request = AssertionRequest.fromJson(challenge.requestJson)
        val response = runCatching { PublicKeyCredential.parseAssertionResponseJson(credential.toString()) }
            .getOrElse {
                authService.recordLockedFailure(key)
                throw UnauthorizedException("Invalid credentials")
            }
        val result = runCatching { rp.finishAssertion(FinishAssertionOptions.builder().request(request).response(response).build()) }
            .getOrElse {
                authService.recordLockedFailure(key)
                throw UnauthorizedException("Invalid credentials")
            }
        if (!result.isSuccess || !result.isUserVerified) {
            authService.recordLockedFailure(key)
            throw UnauthorizedException("Invalid credentials")
        }
        val stored = repository.find(result.credentialId.bytes) ?: throw UnauthorizedException("Invalid credentials")
        if (expectedUser != null && stored.userId != expectedUser) throw UnauthorizedException("Invalid credentials")
        val user = identityRepository.lockUser(stored.userId)?.takeIf { it.enabled }
            ?: throw UnauthorizedException("Invalid credentials")
        if (repository.find(result.credentialId.bytes) == null) throw UnauthorizedException("Invalid credentials")
        if (result.username != user.email) throw UnauthorizedException("Invalid credentials")
        repository.updateCount(result.credentialId.bytes, result.signatureCount)
        identityRepository.clearThrottle(key)
        identityRepository.clearThrottle("passkey-start-ip:${clientIp.ifBlank { "unknown" }}")
        if (expectedUser != null) identityRepository.clearThrottle("passkey-stepup:$expectedUser")
        return user
    }

    @Transactional(noRollbackFor = [UnauthorizedException::class, com.constitutionatlas.identity.TooManyRequestsException::class])
    fun revoke(authorization: String?, credentialId: String, password: String) {
        val user = authService.requireLockedSession(authorization)
        authService.verifyPassword(user, password)
        if (identityRepository.hasSecondFactor(user.id)) authService.requireFreshStepUp(authorization)
        if (identityRepository.toUserDto(user).mfaRequired && !identityRepository.mfaEnabled(user.id) && repository.list(user.id).size <= 1) {
            throw com.constitutionatlas.identity.ConflictException("A second factor is required for this account")
        }
        val id = runCatching { Base64.getUrlDecoder().decode(credentialId) }.getOrNull() ?: throw BadRequestException("Invalid passkey")
        if (!repository.delete(user.id, id)) throw BadRequestException("Unknown passkey")
    }
}

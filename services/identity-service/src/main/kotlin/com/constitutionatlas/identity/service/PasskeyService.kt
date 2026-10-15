package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.api.LoginResponse
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.PasskeyRepository
import com.constitutionatlas.platform.UnauthorizedException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
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
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import java.net.URI
import java.nio.ByteBuffer
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
    private val passwordEncoder: PasswordEncoder,
    private val mapper: ObjectMapper,
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

    fun startEnrollment(authorization: String?, password: String): PasskeyStart {
        val user = authService.requireSession(authorization)
        if (!passwordEncoder.matches(password, user.passwordHash)) throw UnauthorizedException("Invalid credentials")
        if (identityRepository.toUserDto(user).mfaRequired) authService.requireFreshStepUp(authorization)
        return enrollmentOptions(user.id, user.email)
    }

    fun startLoginEnrollment(challengeToken: String): PasskeyStart {
        val challenge = mfaService.requireChallenge(challengeToken, "enroll")
        val user = identityRepository.findUserById(challenge.userId)?.takeIf { it.enabled }
            ?: throw UnauthorizedException("Invalid credentials")
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

    fun finishEnrollment(authorization: String?, challengeId: UUID, credential: JsonNode, label: String) {
        val user = authService.requireSession(authorization)
        verifyEnrollment(user.id, challengeId, credential, label)
    }

    fun finishLoginEnrollment(challengeToken: String, challengeId: UUID, credential: JsonNode, label: String, clientIp: String, userAgent: String?): LoginResponse {
        val loginChallenge = mfaService.requireChallenge(challengeToken, "enroll")
        val user = identityRepository.findUserById(loginChallenge.userId)?.takeIf { it.enabled }
            ?: throw UnauthorizedException("Invalid credentials")
        verifyEnrollment(user.id, challengeId, credential, label)
        identityRepository.deleteChallenge(loginChallenge.id)
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

    fun finishLogin(challengeId: UUID, credential: JsonNode, clientIp: String, userAgent: String?): LoginResponse {
        val key = "passkey-ip:${clientIp.ifBlank { "unknown" }}"
        authService.rejectLocked(key)
        val challenge = repository.consumeChallenge(challengeId, "login") ?: throw UnauthorizedException("Invalid credentials")
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
        val user = identityRepository.findUserById(stored.userId)?.takeIf { it.enabled }
            ?: throw UnauthorizedException("Invalid credentials")
        if (result.username != user.email) throw UnauthorizedException("Invalid credentials")
        repository.updateCount(result.credentialId.bytes, result.signatureCount)
        identityRepository.clearThrottle(key)
        return authService.issuePasskeySession(user, clientIp, userAgent)
    }

    fun revoke(authorization: String?, credentialId: String, password: String) {
        val user = authService.requireSession(authorization)
        if (!passwordEncoder.matches(password, user.passwordHash)) throw UnauthorizedException("Invalid credentials")
        if (identityRepository.toUserDto(user).mfaRequired) authService.requireFreshStepUp(authorization)
        val id = runCatching { Base64.getUrlDecoder().decode(credentialId) }.getOrNull() ?: throw BadRequestException("Invalid passkey")
        if (!repository.delete(user.id, id)) throw BadRequestException("Unknown passkey")
    }
}

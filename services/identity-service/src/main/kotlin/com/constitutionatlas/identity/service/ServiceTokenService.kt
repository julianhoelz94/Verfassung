package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.ConflictException
import com.constitutionatlas.identity.ForbiddenException
import com.constitutionatlas.identity.api.CreateServiceTokenRequest
import com.constitutionatlas.identity.api.RotateServiceTokenRequest
import com.constitutionatlas.identity.api.ServiceTokenCreatedDto
import com.constitutionatlas.identity.api.ServiceTokenDto
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.StoredUser
import com.constitutionatlas.identity.repo.toDto
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Service
class ServiceTokenService(
    private val identityRepository: IdentityRepository,
    private val authService: AuthService,
    private val random: SecureRandom = SecureRandom(),
) {
    fun list(authorization: String?): List<ServiceTokenDto> {
        requireAdmin(authorization)
        return identityRepository.listServiceTokens().map { it.toDto() }
    }

    fun create(authorization: String?, request: CreateServiceTokenRequest): ServiceTokenCreatedDto {
        val admin = requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        val name = request.name.trim()
        if (name.isEmpty() || name.length > 100) {
            throw BadRequestException("Service token name is required")
        }
        val scopes = parseScopes(request.scopes)
        if (identityRepository.findActiveServiceTokenByName(name) != null) {
            throw ConflictException("A service token named '$name' already exists")
        }
        val plaintext = Tokens.urlToken(random)
        val expiresAt = resolveExpiry(request.expiresAt)
        val id = identityRepository.insertServiceToken(name, Tokens.sha256Hex(plaintext), scopes, admin.id, expiresAt)
        val stored =
            identityRepository.findServiceTokenById(id)
                ?: throw IllegalStateException("Token missing after insert")
        return ServiceTokenCreatedDto(
            id = stored.id,
            name = stored.name,
            token = plaintext,
            scopes = stored.scopes,
            createdAt = stored.createdAt,
            expiresAt = stored.expiresAt,
        )
    }

    fun rotate(authorization: String?, tokenId: UUID, request: RotateServiceTokenRequest?): ServiceTokenCreatedDto {
        requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        val stored =
            identityRepository.findServiceTokenById(tokenId)
                ?: throw BadRequestException("Unknown service token")
        if (stored.revokedAt != null) {
            throw BadRequestException("Token is revoked")
        }
        val plaintext = Tokens.urlToken(random)
        val expiresAt = resolveExpiry(request?.expiresAt)
        if (!identityRepository.rotateServiceToken(tokenId, Tokens.sha256Hex(plaintext), expiresAt)) {
            throw BadRequestException("Unknown service token")
        }
        val rotated =
            identityRepository.findServiceTokenById(tokenId)
                ?: throw IllegalStateException("Token missing after rotate")
        return ServiceTokenCreatedDto(
            id = rotated.id,
            name = rotated.name,
            token = plaintext,
            scopes = rotated.scopes,
            createdAt = rotated.createdAt,
            expiresAt = rotated.expiresAt,
        )
    }

    fun revoke(authorization: String?, tokenId: UUID) {
        requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        if (!identityRepository.revokeServiceToken(tokenId)) {
            throw BadRequestException("Unknown service token")
        }
    }

    private fun requireAdmin(authorization: String?): StoredUser {
        val user = authService.requireSession(authorization)
        if ("admin" !in identityRepository.rolesForUser(user.id)) {
            throw ForbiddenException("Administrator role required")
        }
        return user
    }

    companion object {
        val ALLOWED_SCOPES =
            listOf(
                "catalog:write",
                "catalog:publish",
                "content:write",
                "search:reindex",
                "audit:append",
                "audit:read",
                "ingestion:import",
            )

        fun parseScopes(raw: List<String>): List<String> {
            val scopes = raw.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
            if (scopes.isEmpty() || scopes.any { it !in ALLOWED_SCOPES }) {
                throw BadRequestException("Scopes must be a non-empty subset of ${ALLOWED_SCOPES.joinToString()}")
            }
            return scopes
        }

        const val DEFAULT_TTL_DAYS: Long = 90
        const val MAX_TTL_DAYS: Long = 365

        fun resolveExpiry(requested: OffsetDateTime?): OffsetDateTime {
            val now = OffsetDateTime.now(ZoneOffset.UTC)
            val max = now.plusDays(MAX_TTL_DAYS)
            val expiresAt = requested ?: now.plusDays(DEFAULT_TTL_DAYS)
            if (!expiresAt.isAfter(now) || expiresAt.isAfter(max)) {
                throw BadRequestException("expiresAt must be in the future and within $MAX_TTL_DAYS days")
            }
            return expiresAt
        }
    }
}

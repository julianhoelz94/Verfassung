package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.ConflictException
import com.constitutionatlas.identity.ForbiddenException
import com.constitutionatlas.identity.api.CreateServiceTokenRequest
import com.constitutionatlas.identity.api.ServiceTokenCreatedDto
import com.constitutionatlas.identity.api.ServiceTokenDto
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.StoredUser
import com.constitutionatlas.identity.repo.toDto
import org.springframework.stereotype.Service
import java.security.SecureRandom
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
        val id = identityRepository.insertServiceToken(name, Tokens.sha256Hex(plaintext), scopes, admin.id)
        val stored =
            identityRepository.findServiceTokenById(id)
                ?: throw IllegalStateException("Token missing after insert")
        return ServiceTokenCreatedDto(
            id = stored.id,
            name = stored.name,
            token = plaintext,
            scopes = stored.scopes,
            createdAt = stored.createdAt,
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
            listOf("catalog:write", "content:write", "search:reindex", "audit:append", "ingestion:import")

        fun parseScopes(raw: List<String>): List<String> {
            val scopes = raw.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
            if (scopes.isEmpty() || scopes.any { it !in ALLOWED_SCOPES }) {
                throw BadRequestException("Scopes must be a non-empty subset of ${ALLOWED_SCOPES.joinToString()}")
            }
            return scopes
        }
    }
}

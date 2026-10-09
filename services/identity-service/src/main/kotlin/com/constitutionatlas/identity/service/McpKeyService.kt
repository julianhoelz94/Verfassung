package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.ConflictException
import com.constitutionatlas.identity.api.CreateMcpKeyRequest
import com.constitutionatlas.identity.api.McpKeyCreatedDto
import com.constitutionatlas.identity.api.McpKeyDto
import com.constitutionatlas.identity.client.AuthAudit
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.McpKeyRepository
import com.constitutionatlas.identity.repo.StoredMcpKey
import com.constitutionatlas.platform.ForbiddenException
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Service
class McpKeyService(
    private val keys: McpKeyRepository,
    private val users: IdentityRepository,
    private val auth: AuthService,
    private val audit: AuthAudit,
) {
    private val random = SecureRandom()

    fun list(authorization: String?): List<McpKeyDto> {
        val owner = auth.requireSession(authorization)
        return keys.list(owner.id).map { it.dto() }
    }

    fun create(authorization: String?, request: CreateMcpKeyRequest, ip: String, agent: String?): McpKeyCreatedDto {
        val owner = auth.requireSession(authorization)
        val name = request.name.trim()
        if (name.isEmpty() || name.length > 100) throw BadRequestException("Key name must contain 1 to 100 characters")
        val scopes = parseScopes(request.scopes)
        authorizeImport(owner.id, scopes, authorization)
        if (keys.activeNameExists(owner.id, name)) throw ConflictException("An active MCP key with this name exists")
        val expiry = ServiceTokenService.resolveExpiry(request.expiresAt)
        val plaintext = "ca_mcp_${Tokens.urlToken(random)}"
        val id = keys.insert(owner.id, name, Tokens.sha256Hex(plaintext), scopes, expiry)
        audit.record("mcp_key_created", owner.id, owner.id, owner.email, ip, agent, mapOf("keyId" to id, "scopes" to scopes))
        val key = keys.findOwned(owner.id, id) ?: error("Key missing after creation")
        return McpKeyCreatedDto(key.dto(), plaintext)
    }

    fun rotate(authorization: String?, id: UUID, ip: String, agent: String?): McpKeyCreatedDto {
        val owner = auth.requireSession(authorization)
        val key = keys.findOwned(owner.id, id)?.takeIf { it.revokedAt == null }
            ?: throw BadRequestException("Unknown active MCP key")
        authorizeImport(owner.id, key.scopes, authorization)
        val plaintext = "ca_mcp_${Tokens.urlToken(random)}"
        if (!keys.rotate(owner.id, id, Tokens.sha256Hex(plaintext), ServiceTokenService.resolveExpiry(null))) {
            throw BadRequestException("Unknown active MCP key")
        }
        audit.record("mcp_key_rotated", owner.id, owner.id, owner.email, ip, agent, mapOf("keyId" to id))
        return McpKeyCreatedDto((keys.findOwned(owner.id, id) ?: error("Key missing after rotation")).dto(), plaintext)
    }

    fun revoke(authorization: String?, id: UUID, ip: String, agent: String?) {
        val owner = auth.requireSession(authorization)
        if (!keys.revoke(owner.id, id)) throw BadRequestException("Unknown active MCP key")
        audit.record("mcp_key_revoked", owner.id, owner.id, owner.email, ip, agent, mapOf("keyId" to id))
    }

    private fun authorizeImport(ownerId: UUID, scopes: List<String>, authorization: String?) {
        if ("ingestion:import" !in scopes) return
        if (users.rolesForUser(ownerId).none { it == "editor" || it == "admin" }) {
            throw ForbiddenException("Editor role required for import keys")
        }
        val hash = Tokens.sha256Hex(Tokens.requireBearer(authorization))
        val stepUpAt = users.stepUpAt(hash)
        if (!users.mfaEnabled(ownerId) || stepUpAt == null || stepUpAt.isBefore(Instant.now().minusSeconds(300))) {
            throw com.constitutionatlas.identity.StepUpRequiredException()
        }
    }

    private fun parseScopes(raw: List<String>): List<String> {
        val scopes = raw.map { it.trim() }.distinct()
        if (scopes.isEmpty() || scopes.any { it !in setOf("mcp:read", "ingestion:import") }) {
            throw BadRequestException("MCP key scopes must be mcp:read and optionally ingestion:import")
        }
        return scopes
    }

    private fun StoredMcpKey.dto() = McpKeyDto(id, name, scopes, createdAt, expiresAt, lastUsedAt, revokedAt)
}

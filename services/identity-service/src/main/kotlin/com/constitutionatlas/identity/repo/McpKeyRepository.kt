package com.constitutionatlas.identity.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

data class StoredMcpKey(
    val id: UUID,
    val ownerId: UUID,
    val name: String,
    val scopes: List<String>,
    val createdAt: OffsetDateTime,
    val expiresAt: OffsetDateTime,
    val lastUsedAt: OffsetDateTime?,
    val revokedAt: OffsetDateTime?,
)

@Repository
class McpKeyRepository(private val jdbc: JdbcTemplate) {
    private val mapper = RowMapper { rs, _ ->
        StoredMcpKey(
            id = rs.getObject("id", UUID::class.java),
            ownerId = rs.getObject("owner_id", UUID::class.java),
            name = rs.getString("name"),
            scopes = (rs.getArray("scopes").array as Array<*>).map { it.toString() },
            createdAt = rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            expiresAt = rs.getTimestamp("expires_at").toInstant().atOffset(ZoneOffset.UTC),
            lastUsedAt = rs.getTimestamp("last_used_at")?.toInstant()?.atOffset(ZoneOffset.UTC),
            revokedAt = rs.getTimestamp("revoked_at")?.toInstant()?.atOffset(ZoneOffset.UTC),
        )
    }

    private val columns = "id, owner_id, name, scopes, created_at, expires_at, last_used_at, revoked_at"

    fun list(ownerId: UUID): List<StoredMcpKey> =
        jdbc.query("SELECT $columns FROM mcp_keys WHERE owner_id = ? ORDER BY created_at DESC", mapper, ownerId)

    fun findOwned(ownerId: UUID, id: UUID): StoredMcpKey? =
        jdbc.query("SELECT $columns FROM mcp_keys WHERE owner_id = ? AND id = ?", mapper, ownerId, id).firstOrNull()

    fun findValidByHash(hash: String): StoredMcpKey? =
        jdbc.query("SELECT $columns FROM mcp_keys WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()", mapper, hash).firstOrNull()

    fun activeNameExists(ownerId: UUID, name: String): Boolean =
        jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM mcp_keys WHERE owner_id = ? AND name = ? AND revoked_at IS NULL)", Boolean::class.java, ownerId, name) == true

    fun insert(ownerId: UUID, name: String, tokenHash: String, scopes: List<String>, expiresAt: OffsetDateTime): UUID {
        val id = UUID.randomUUID()
        jdbc.update { connection ->
            connection.prepareStatement(
                "INSERT INTO mcp_keys (id, owner_id, name, token_hash, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
            ).apply {
                setObject(1, id)
                setObject(2, ownerId)
                setString(3, name)
                setString(4, tokenHash)
                setArray(5, connection.createArrayOf("text", scopes.toTypedArray()))
                setTimestamp(6, Timestamp.from(expiresAt.toInstant()))
            }
        }
        return id
    }

    fun rotate(ownerId: UUID, id: UUID, tokenHash: String, expiresAt: OffsetDateTime): Boolean =
        jdbc.update(
            "UPDATE mcp_keys SET token_hash = ?, expires_at = ?, last_used_at = NULL WHERE id = ? AND owner_id = ? AND revoked_at IS NULL",
            tokenHash, Timestamp.from(expiresAt.toInstant()), id, ownerId,
        ) > 0

    fun revoke(ownerId: UUID, id: UUID): Boolean =
        jdbc.update("UPDATE mcp_keys SET revoked_at = NOW() WHERE id = ? AND owner_id = ? AND revoked_at IS NULL", id, ownerId) > 0

    fun touch(id: UUID) {
        jdbc.update("UPDATE mcp_keys SET last_used_at = NOW() WHERE id = ?", id)
    }
}

package com.constitutionatlas.identity.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.time.OffsetDateTime
import java.util.UUID

data class OAuthClient(val id: UUID, val name: String, val redirectUris: List<String>)

data class OAuthCode(
    val codeHash: String,
    val clientId: UUID,
    val ownerId: UUID,
    val redirectUri: String,
    val resource: String,
    val scopes: List<String>,
    val codeChallenge: String,
)

data class OAuthAccessToken(
    val ownerId: UUID,
    val clientId: UUID,
    val resource: String,
    val scopes: List<String>,
    val expiresAt: OffsetDateTime,
)
data class OAuthGrant(val clientId: UUID, val clientName: String, val expiresAt: OffsetDateTime)

@Repository
class OAuthRepository(private val jdbc: JdbcTemplate) {
    fun registerClient(name: String, redirectUris: List<String>): OAuthClient {
        val id = UUID.randomUUID()
        jdbc.update { connection ->
            connection.prepareStatement("INSERT INTO oauth_clients (id, name, redirect_uris) VALUES (?, ?, ?)").apply {
                setObject(1, id)
                setString(2, name)
                setArray(3, connection.createArrayOf("text", redirectUris.toTypedArray()))
            }
        }
        return OAuthClient(id, name, redirectUris)
    }

    fun client(id: UUID): OAuthClient? =
        jdbc.query("SELECT id, name, redirect_uris FROM oauth_clients WHERE id = ?", { rs, _ ->
            OAuthClient(rs.getObject("id", UUID::class.java), rs.getString("name"), (rs.getArray("redirect_uris").array as Array<*>).map { it.toString() })
        }, id).firstOrNull()

    fun storeCode(code: OAuthCode, expiresAt: OffsetDateTime) {
        jdbc.update { connection ->
            connection.prepareStatement("INSERT INTO oauth_authorization_codes (code_hash, client_id, owner_id, redirect_uri, resource, scopes, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").apply {
                setString(1, code.codeHash)
                setObject(2, code.clientId)
                setObject(3, code.ownerId)
                setString(4, code.redirectUri)
                setString(5, code.resource)
                setArray(6, connection.createArrayOf("text", code.scopes.toTypedArray()))
                setString(7, code.codeChallenge)
                setTimestamp(8, Timestamp.from(expiresAt.toInstant()))
            }
        }
    }

    fun validCode(hash: String): OAuthCode? =
        jdbc.query("SELECT code_hash, client_id, owner_id, redirect_uri, resource, scopes, code_challenge FROM oauth_authorization_codes WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > NOW()", { rs, _ ->
            OAuthCode(rs.getString("code_hash"), rs.getObject("client_id", UUID::class.java), rs.getObject("owner_id", UUID::class.java), rs.getString("redirect_uri"), rs.getString("resource"), (rs.getArray("scopes").array as Array<*>).map { it.toString() }, rs.getString("code_challenge"))
        }, hash).firstOrNull()

    fun consumeCode(hash: String): Boolean =
        jdbc.update("UPDATE oauth_authorization_codes SET consumed_at = NOW() WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > NOW()", hash) == 1

    fun storeToken(hash: String, code: OAuthCode, expiresAt: OffsetDateTime) {
        jdbc.update { connection ->
            connection.prepareStatement("INSERT INTO oauth_access_tokens (token_hash, client_id, owner_id, resource, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?)").apply {
                setString(1, hash)
                setObject(2, code.clientId)
                setObject(3, code.ownerId)
                setString(4, code.resource)
                setArray(5, connection.createArrayOf("text", code.scopes.toTypedArray()))
                setTimestamp(6, Timestamp.from(expiresAt.toInstant()))
            }
        }
    }

    fun validToken(hash: String): OAuthAccessToken? =
        jdbc.query("SELECT owner_id, client_id, resource, scopes, expires_at FROM oauth_access_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()", { rs, _ ->
            OAuthAccessToken(rs.getObject("owner_id", UUID::class.java), rs.getObject("client_id", UUID::class.java), rs.getString("resource"), (rs.getArray("scopes").array as Array<*>).map { it.toString() }, rs.getTimestamp("expires_at").toInstant().atOffset(java.time.ZoneOffset.UTC))
        }, hash).firstOrNull()

    fun revokeToken(hash: String) {
        jdbc.update("UPDATE oauth_access_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL", hash)
    }

    fun activeGrants(ownerId: UUID): List<OAuthGrant> =
        jdbc.query(
            "SELECT c.id, c.name, MAX(t.expires_at) AS expires_at FROM oauth_access_tokens t JOIN oauth_clients c ON c.id = t.client_id WHERE t.owner_id = ? AND t.revoked_at IS NULL AND t.expires_at > NOW() GROUP BY c.id, c.name ORDER BY c.name, c.id",
            { rs, _ -> OAuthGrant(rs.getObject("id", UUID::class.java), rs.getString("name"), rs.getTimestamp("expires_at").toInstant().atOffset(java.time.ZoneOffset.UTC)) },
            ownerId,
        )

    fun revokeGrant(ownerId: UUID, clientId: UUID) {
        jdbc.update("UPDATE oauth_access_tokens SET revoked_at = NOW() WHERE owner_id = ? AND client_id = ? AND revoked_at IS NULL", ownerId, clientId)
    }
}

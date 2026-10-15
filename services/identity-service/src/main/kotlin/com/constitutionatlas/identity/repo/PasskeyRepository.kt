package com.constitutionatlas.identity.repo

import com.constitutionatlas.identity.TooManyRequestsException
import com.yubico.webauthn.CredentialRepository
import com.yubico.webauthn.RegisteredCredential
import com.yubico.webauthn.data.PublicKeyCredentialDescriptor
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.nio.ByteBuffer
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import java.util.Optional
import java.util.UUID
import com.yubico.webauthn.data.ByteArray as WebAuthnBytes

data class StoredPasskey(
    val credentialId: ByteArray,
    val userId: UUID,
    val publicKeyCose: ByteArray,
    val signatureCount: Long,
    val label: String,
    val createdAt: Instant,
    val lastUsedAt: Instant?,
)

data class StoredPasskeyChallenge(
    val id: UUID,
    val userId: UUID?,
    val purpose: String,
    val requestJson: String,
)

@Repository
class PasskeyRepository(
    private val jdbc: JdbcTemplate,
    private val identityRepository: IdentityRepository,
) : CredentialRepository {
    override fun getCredentialIdsForUsername(username: String): Set<PublicKeyCredentialDescriptor> {
        val user = identityRepository.findUserByEmail(username) ?: return emptySet()
        return list(user.id).map {
            PublicKeyCredentialDescriptor.builder().id(WebAuthnBytes(it.credentialId)).build()
        }.toSet()
    }

    override fun getUserHandleForUsername(username: String): Optional<WebAuthnBytes> =
        Optional.ofNullable(identityRepository.findUserByEmail(username)?.id?.let { WebAuthnBytes(userHandle(it)) })

    override fun getUsernameForUserHandle(userHandle: WebAuthnBytes): Optional<String> =
        Optional.ofNullable(idFromHandle(userHandle.bytes)?.let(identityRepository::findUserById)?.email)

    override fun lookup(credentialId: WebAuthnBytes, userHandle: WebAuthnBytes): Optional<RegisteredCredential> =
        Optional.ofNullable(
            find(credentialId.bytes)?.takeIf { it.userId == idFromHandle(userHandle.bytes) }?.let(::registered),
        )

    override fun lookupAll(credentialId: WebAuthnBytes): Set<RegisteredCredential> =
        find(credentialId.bytes)?.let { setOf(registered(it)) } ?: emptySet()

    fun list(userId: UUID): List<StoredPasskey> =
        jdbc.query(
            "SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC",
            { rs, _ -> mapCredential(rs) },
            userId,
        )

    fun find(credentialId: ByteArray): StoredPasskey? =
        jdbc.query("SELECT * FROM passkey_credentials WHERE credential_id = ?", { rs, _ -> mapCredential(rs) }, credentialId)
            .firstOrNull()

    fun insert(userId: UUID, credentialId: ByteArray, publicKey: ByteArray, count: Long, label: String) {
        jdbc.update(
            "INSERT INTO passkey_credentials (credential_id, user_id, public_key_cose, signature_count, label) VALUES (?, ?, ?, ?, ?)",
            credentialId,
            userId,
            publicKey,
            count,
            label,
        )
    }

    fun updateCount(credentialId: ByteArray, count: Long) {
        jdbc.update(
            "UPDATE passkey_credentials SET signature_count = ?, last_used_at = NOW() WHERE credential_id = ?",
            count,
            credentialId,
        )
    }

    fun delete(userId: UUID, credentialId: ByteArray): Boolean =
        jdbc.update("DELETE FROM passkey_credentials WHERE user_id = ? AND credential_id = ?", userId, credentialId) == 1

    fun storeChallenge(userId: UUID?, purpose: String, requestJson: String): UUID {
        jdbc.update("DELETE FROM passkey_challenges WHERE expires_at < NOW() OR used_at IS NOT NULL")
        val pending = jdbc.queryForObject("SELECT count(*) FROM passkey_challenges", Int::class.java) ?: 0
        if (pending >= 10_000) throw TooManyRequestsException("Passkey service is busy")
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO passkey_challenges (id, user_id, purpose, request_json, expires_at) VALUES (?, ?, ?, ?, ?)",
            id,
            userId,
            purpose,
            requestJson,
            Timestamp.from(Instant.now().plusSeconds(300)),
        )
        return id
    }

    fun consumeChallenge(id: UUID, purpose: String): StoredPasskeyChallenge? {
        val row = jdbc.query(
            "SELECT id, user_id, purpose, request_json FROM passkey_challenges WHERE id = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW()",
            { rs, _ -> StoredPasskeyChallenge(rs.getObject("id", UUID::class.java), rs.getObject("user_id", UUID::class.java), rs.getString("purpose"), rs.getString("request_json")) },
            id,
            purpose,
        ).firstOrNull() ?: return null
        return row.takeIf { jdbc.update("UPDATE passkey_challenges SET used_at = NOW() WHERE id = ? AND used_at IS NULL", id) == 1 }
    }

    private fun registered(stored: StoredPasskey): RegisteredCredential =
        RegisteredCredential.builder()
            .credentialId(WebAuthnBytes(stored.credentialId))
            .userHandle(WebAuthnBytes(userHandle(stored.userId)))
            .publicKeyCose(WebAuthnBytes(stored.publicKeyCose))
            .signatureCount(stored.signatureCount)
            .build()

    private fun mapCredential(rs: ResultSet) = StoredPasskey(
        rs.getBytes("credential_id"),
        rs.getObject("user_id", UUID::class.java),
        rs.getBytes("public_key_cose"),
        rs.getLong("signature_count"),
        rs.getString("label"),
        rs.getTimestamp("created_at").toInstant(),
        rs.getTimestamp("last_used_at")?.toInstant(),
    )

    private fun userHandle(id: UUID): ByteArray = ByteBuffer.allocate(16).putLong(id.mostSignificantBits).putLong(id.leastSignificantBits).array()

    private fun idFromHandle(bytes: ByteArray): UUID? =
        if (bytes.size == 16) ByteBuffer.wrap(bytes).let { UUID(it.long, it.long) } else null
}

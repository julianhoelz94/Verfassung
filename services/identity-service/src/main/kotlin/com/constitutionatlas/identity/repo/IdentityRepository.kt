package com.constitutionatlas.identity.repo

import com.constitutionatlas.identity.api.SessionInfoDto
import com.constitutionatlas.identity.api.UserDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

data class StoredUser(
    val id: UUID,
    val email: String,
    val passwordHash: String,
    val enabled: Boolean = true,
    val createdAt: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC),
)

data class StoredThrottle(
    val failureCount: Int,
    val lockedUntil: Instant?,
)

data class StoredInvite(
    val id: UUID,
    val userId: UUID,
    val expiresAt: Instant,
    val usedAt: Instant?,
)

data class StoredPasswordReset(
    val id: UUID,
    val userId: UUID,
    val expiresAt: Instant,
    val usedAt: Instant?,
)

@Repository
class IdentityRepository(private val jdbc: JdbcTemplate) {
    fun findRoleId(name: String): UUID? =
        jdbc.query(
            "SELECT id FROM roles WHERE name = ?",
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            name,
        ).firstOrNull()

    fun findUserByEmail(email: String): StoredUser? =
        jdbc.query(
            "SELECT id, email, password_hash, enabled, created_at FROM users WHERE lower(email) = lower(?)",
            userMapper,
            email,
        ).firstOrNull()

    fun findUserById(id: UUID): StoredUser? =
        jdbc.query(
            "SELECT id, email, password_hash, enabled, created_at FROM users WHERE id = ?",
            userMapper,
            id,
        ).firstOrNull()

    fun listUsers(): List<StoredUser> =
        jdbc.query(
            "SELECT id, email, password_hash, enabled, created_at FROM users ORDER BY email",
            userMapper,
        )

    fun insertUser(email: String, passwordHash: String, enabled: Boolean = true): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO users (id, email, password_hash, enabled) VALUES (?, ?, ?, ?)",
            id,
            email.lowercase(),
            passwordHash,
            enabled,
        )
        return id
    }

    fun updatePasswordHash(userId: UUID, passwordHash: String) {
        jdbc.update("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, userId)
    }

    fun assignRole(userId: UUID, roleId: UUID) {
        jdbc.update(
            """
            INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
            ON CONFLICT DO NOTHING
            """.trimIndent(),
            userId,
            roleId,
        )
    }

    fun rolesForUser(userId: UUID): List<String> =
        jdbc.query(
            """
            SELECT r.name
            FROM roles r
            JOIN user_roles ur ON ur.role_id = r.id
            WHERE ur.user_id = ?
            ORDER BY r.name
            """.trimIndent(),
            { rs, _ -> rs.getString("name") },
            userId,
        )

    fun toUserDto(user: StoredUser): UserDto = UserDto(user.id, user.email, rolesForUser(user.id))

    fun insertSession(
        userId: UUID,
        tokenHash: String,
        expiresAt: OffsetDateTime,
        lastSeenAt: OffsetDateTime,
    ): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            userId,
            tokenHash,
            Timestamp.from(expiresAt.toInstant()),
            Timestamp.from(lastSeenAt.toInstant()),
        )
        return id
    }

    fun findUserByValidTokenHash(tokenHash: String): StoredUser? =
        jdbc.query(
            """
            SELECT u.id, u.email, u.password_hash, u.enabled, u.created_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
              AND s.expires_at > NOW()
              AND u.enabled = TRUE
            """.trimIndent(),
            userMapper,
            tokenHash,
        ).firstOrNull()

    fun findSessionIdByTokenHash(tokenHash: String): UUID? =
        jdbc.query(
            "SELECT id FROM sessions WHERE token_hash = ?",
            { rs, _ -> rs.getObject("id", UUID::class.java) },
            tokenHash,
        ).firstOrNull()

    fun lastSeenAt(tokenHash: String): Instant? =
        jdbc.query(
            "SELECT last_seen_at FROM sessions WHERE token_hash = ?",
            { rs, _ -> rs.getTimestamp("last_seen_at").toInstant() },
            tokenHash,
        ).firstOrNull()

    fun touchSession(tokenHash: String) {
        jdbc.update("UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = ?", tokenHash)
    }

    fun listSessions(userId: UUID, currentTokenHash: String): List<SessionInfoDto> =
        jdbc.query(
            """
            SELECT id, created_at, last_seen_at, token_hash
            FROM sessions
            WHERE user_id = ?
            ORDER BY created_at DESC
            """.trimIndent(),
            { rs, _ ->
                SessionInfoDto(
                    id = rs.getObject("id", UUID::class.java),
                    createdAt = rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
                    lastSeenAt = rs.getTimestamp("last_seen_at").toInstant().atOffset(ZoneOffset.UTC),
                    current = rs.getString("token_hash") == currentTokenHash,
                )
            },
            userId,
        )

    fun sessionBelongsToUser(sessionId: UUID, userId: UUID): Boolean {
        val count =
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM sessions WHERE id = ? AND user_id = ?",
                Int::class.java,
                sessionId,
                userId,
            )
        return (count ?: 0) > 0
    }

    fun deleteSessionById(sessionId: UUID) {
        jdbc.update("DELETE FROM sessions WHERE id = ?", sessionId)
    }

    fun deleteSessionsForUser(userId: UUID) {
        jdbc.update("DELETE FROM sessions WHERE user_id = ?", userId)
    }

    fun deleteOtherSessions(userId: UUID, keepTokenHash: String) {
        jdbc.update("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", userId, keepTokenHash)
    }

    fun deleteSessionByTokenHash(tokenHash: String) {
        jdbc.update("DELETE FROM sessions WHERE token_hash = ?", tokenHash)
    }

    fun deleteExpiredSessions(idleCutoff: Instant) {
        jdbc.update(
            "DELETE FROM sessions WHERE expires_at < NOW() OR last_seen_at < ?",
            Timestamp.from(idleCutoff),
        )
    }

    fun findThrottle(key: String): StoredThrottle? =
        jdbc.query(
            "SELECT failure_count, locked_until FROM login_throttle WHERE throttle_key = ?",
            { rs, _ ->
                StoredThrottle(
                    failureCount = rs.getInt("failure_count"),
                    lockedUntil = rs.getTimestamp("locked_until")?.toInstant(),
                )
            },
            key,
        ).firstOrNull()

    fun upsertThrottle(key: String, failureCount: Int, lockedUntil: Instant?) {
        jdbc.update(
            """
            INSERT INTO login_throttle (throttle_key, failure_count, locked_until, updated_at)
            VALUES (?, ?, ?, NOW())
            ON CONFLICT (throttle_key) DO UPDATE SET
              failure_count = EXCLUDED.failure_count,
              locked_until = EXCLUDED.locked_until,
              updated_at = NOW()
            """.trimIndent(),
            key,
            failureCount,
            lockedUntil?.let { Timestamp.from(it) },
        )
    }

    fun clearThrottle(key: String) {
        jdbc.update("DELETE FROM login_throttle WHERE throttle_key = ?", key)
    }

    fun setEnabled(userId: UUID, enabled: Boolean) {
        jdbc.update("UPDATE users SET enabled = ? WHERE id = ?", enabled, userId)
    }

    fun clearRoles(userId: UUID) {
        jdbc.update("DELETE FROM user_roles WHERE user_id = ?", userId)
    }

    fun insertInvite(userId: UUID, tokenHash: String, expiresAt: Instant): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO invites (id, user_id, token_hash, expires_at)
            VALUES (?, ?, ?, ?)
            """.trimIndent(),
            id,
            userId,
            tokenHash,
            Timestamp.from(expiresAt),
        )
        return id
    }

    fun findInviteByTokenHash(tokenHash: String): StoredInvite? =
        jdbc.query(
            "SELECT id, user_id, expires_at, used_at FROM invites WHERE token_hash = ?",
            inviteMapper,
            tokenHash,
        ).firstOrNull()

    fun findUnusedInvite(userId: UUID): StoredInvite? =
        jdbc.query(
            """
            SELECT id, user_id, expires_at, used_at
            FROM invites
            WHERE user_id = ? AND used_at IS NULL
            ORDER BY created_at DESC
            """.trimIndent(),
            inviteMapper,
            userId,
        ).firstOrNull()

    fun deleteUnusedInvites(userId: UUID) {
        jdbc.update("DELETE FROM invites WHERE user_id = ? AND used_at IS NULL", userId)
    }

    fun markInviteUsed(id: UUID) {
        jdbc.update("UPDATE invites SET used_at = NOW() WHERE id = ?", id)
    }

    fun insertPasswordReset(userId: UUID, tokenHash: String, expiresAt: Instant): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            """
            INSERT INTO password_resets (id, user_id, token_hash, expires_at)
            VALUES (?, ?, ?, ?)
            """.trimIndent(),
            id,
            userId,
            tokenHash,
            Timestamp.from(expiresAt),
        )
        return id
    }

    fun findPasswordResetByTokenHash(tokenHash: String): StoredPasswordReset? =
        jdbc.query(
            "SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?",
            resetMapper,
            tokenHash,
        ).firstOrNull()

    fun deleteUnusedResets(userId: UUID) {
        jdbc.update("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL", userId)
    }

    fun markPasswordResetUsed(id: UUID) {
        jdbc.update("UPDATE password_resets SET used_at = NOW() WHERE id = ?", id)
    }

    private val userMapper = RowMapper { rs, _ ->
        StoredUser(
            id = rs.getObject("id", UUID::class.java),
            email = rs.getString("email"),
            passwordHash = rs.getString("password_hash"),
            enabled = rs.getBoolean("enabled"),
            createdAt = rs.getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
        )
    }

    private val inviteMapper = RowMapper { rs, _ ->
        StoredInvite(
            id = rs.getObject("id", UUID::class.java),
            userId = rs.getObject("user_id", UUID::class.java),
            expiresAt = rs.getTimestamp("expires_at").toInstant(),
            usedAt = rs.getTimestamp("used_at")?.toInstant(),
        )
    }

    private val resetMapper = RowMapper { rs, _ ->
        StoredPasswordReset(
            id = rs.getObject("id", UUID::class.java),
            userId = rs.getObject("user_id", UUID::class.java),
            expiresAt = rs.getTimestamp("expires_at").toInstant(),
            usedAt = rs.getTimestamp("used_at")?.toInstant(),
        )
    }
}

package com.constitutionatlas.identity.repo

import com.constitutionatlas.identity.api.UserDto
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

data class StoredUser(
    val id: UUID,
    val email: String,
    val passwordHash: String,
    val enabled: Boolean = true,
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
            "SELECT id, email, password_hash, enabled FROM users WHERE lower(email) = lower(?)",
            { rs, _ ->
                StoredUser(
                    rs.getObject("id", UUID::class.java),
                    rs.getString("email"),
                    rs.getString("password_hash"),
                    rs.getBoolean("enabled"),
                )
            },
            email,
        ).firstOrNull()

    fun insertUser(email: String, passwordHash: String): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)",
            id,
            email.lowercase(),
            passwordHash,
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

    fun insertSession(userId: UUID, tokenHash: String, expiresAt: OffsetDateTime): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
            id,
            userId,
            tokenHash,
            java.sql.Timestamp.from(expiresAt.toInstant()),
        )
        return id
    }

    fun findUserByValidTokenHash(tokenHash: String): StoredUser? =
        jdbc.query(
            """
            SELECT u.id, u.email, u.password_hash, u.enabled
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
              AND s.expires_at > NOW()
              AND u.enabled = TRUE
            """.trimIndent(),
            { rs, _ ->
                StoredUser(
                    rs.getObject("id", UUID::class.java),
                    rs.getString("email"),
                    rs.getString("password_hash"),
                    rs.getBoolean("enabled"),
                )
            },
            tokenHash,
        ).firstOrNull()

    fun deleteSessionByTokenHash(tokenHash: String) {
        jdbc.update("DELETE FROM sessions WHERE token_hash = ?", tokenHash)
    }
}

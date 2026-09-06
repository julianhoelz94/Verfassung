package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.ConflictException
import com.constitutionatlas.identity.ForbiddenException
import com.constitutionatlas.identity.UnauthorizedException
import com.constitutionatlas.identity.api.InviteCreatedDto
import com.constitutionatlas.identity.api.InviteRequest
import com.constitutionatlas.identity.api.PasswordResetIssuedDto
import com.constitutionatlas.identity.api.UserAdminDto
import com.constitutionatlas.identity.client.AuthAudit
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.StoredUser
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import java.util.HexFormat
import java.util.UUID

@Service
class AccountService(
    private val identityRepository: IdentityRepository,
    private val passwordEncoder: PasswordEncoder,
    private val authAudit: AuthAudit,
    @Value("\${identity.invite.ttl:7d}") private val inviteTtl: Duration,
    @Value("\${identity.password.reset-ttl:1h}") private val resetTtl: Duration,
    @Value("\${identity.password.log-reset-token:false}") private val logResetToken: Boolean,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val random = SecureRandom()

    fun listUsers(authorization: String?): List<UserAdminDto> {
        requireAdmin(authorization)
        return identityRepository.listUsers().map { toAdminDto(it) }
    }

    fun getUser(authorization: String?, userId: UUID): UserAdminDto {
        requireAdmin(authorization)
        val user = identityRepository.findUserById(userId) ?: throw BadRequestException("Unknown user")
        return toAdminDto(user)
    }

    @Transactional
    fun invite(
        authorization: String?,
        request: InviteRequest,
        clientIp: String,
        userAgent: String?,
    ): InviteCreatedDto {
        val admin = requireAdmin(authorization)
        val email = request.email.trim().lowercase()
        if (email.isBlank() || !email.contains("@")) {
            throw BadRequestException("A valid email is required")
        }
        val roleNames = normalizeRoles(request.roles)
        val existing = identityRepository.findUserByEmail(email)
        val userId =
            if (existing != null) {
                if (existing.enabled || identityRepository.findUnusedInvite(existing.id) == null) {
                    throw ConflictException("User already exists")
                }
                identityRepository.clearRoles(existing.id)
                assignRoles(existing.id, roleNames)
                existing.id
            } else {
                val id = identityRepository.insertUser(email, passwordEncoder.encode(newSecret()), enabled = false)
                assignRoles(id, roleNames)
                id
            }
        val (token, expiresAt) = issueInviteToken(userId)
        val user = identityRepository.findUserById(userId) ?: throw BadRequestException("Unknown user")
        authAudit.record(
            "user_invited",
            userId,
            admin.id,
            admin.email,
            clientIp,
            userAgent,
            mapOf("roles" to roleNames),
        )
        return InviteCreatedDto(
            user = toAdminDto(user),
            inviteToken = token,
            expiresAt = expiresAt.atOffset(ZoneOffset.UTC),
        )
    }

    @Transactional
    fun acceptInvite(token: String, password: String, clientIp: String, userAgent: String?): UserAdminDto {
        val invite = identityRepository.findInviteByTokenHash(sha256(token.trim()))
            ?: throw BadRequestException("Invalid or expired invite")
        if (invite.usedAt != null || invite.expiresAt.isBefore(Instant.now())) {
            throw BadRequestException("Invalid or expired invite")
        }
        val user = identityRepository.findUserById(invite.userId)
            ?: throw BadRequestException("Invalid or expired invite")
        validatePassword(password, user.email)
        identityRepository.updatePasswordHash(user.id, passwordEncoder.encode(password))
        identityRepository.setEnabled(user.id, true)
        identityRepository.markInviteUsed(invite.id)
        authAudit.record("user_activated", user.id, user.id, user.email, clientIp, userAgent)
        return toAdminDto(identityRepository.findUserById(user.id)!!)
    }

    @Transactional
    fun disable(authorization: String?, userId: UUID, clientIp: String, userAgent: String?): UserAdminDto {
        val admin = requireAdmin(authorization)
        if (admin.id == userId) {
            throw BadRequestException("Cannot disable your own account")
        }
        val user = identityRepository.findUserById(userId) ?: throw BadRequestException("Unknown user")
        identityRepository.setEnabled(userId, false)
        identityRepository.deleteSessionsForUser(userId)
        authAudit.record("account_disabled", userId, admin.id, admin.email, clientIp, userAgent)
        return toAdminDto(identityRepository.findUserById(userId) ?: user.copy(enabled = false))
    }

    @Transactional
    fun enable(authorization: String?, userId: UUID, clientIp: String, userAgent: String?): UserAdminDto {
        val admin = requireAdmin(authorization)
        val user = identityRepository.findUserById(userId) ?: throw BadRequestException("Unknown user")
        if (identityRepository.findUnusedInvite(userId) != null) {
            throw BadRequestException("Invite has not been accepted")
        }
        identityRepository.setEnabled(userId, true)
        authAudit.record("account_enabled", userId, admin.id, admin.email, clientIp, userAgent)
        return toAdminDto(identityRepository.findUserById(userId) ?: user.copy(enabled = true))
    }

    @Transactional
    fun updateRoles(
        authorization: String?,
        userId: UUID,
        roles: List<String>,
        clientIp: String,
        userAgent: String?,
    ): UserAdminDto {
        val admin = requireAdmin(authorization)
        identityRepository.findUserById(userId) ?: throw BadRequestException("Unknown user")
        val roleNames = normalizeRoles(roles)
        if (admin.id == userId && "admin" !in roleNames) {
            throw BadRequestException("Cannot remove your own administrator role")
        }
        identityRepository.clearRoles(userId)
        roleNames.forEach { roleName ->
            val roleId = identityRepository.findRoleId(roleName) ?: throw BadRequestException("Unknown role")
            identityRepository.assignRole(userId, roleId)
        }
        authAudit.record(
            "role_changed",
            userId,
            admin.id,
            admin.email,
            clientIp,
            userAgent,
            mapOf("roles" to roleNames),
        )
        return toAdminDto(identityRepository.findUserById(userId)!!)
    }

    @Transactional
    fun changePassword(
        authorization: String?,
        currentPassword: String,
        newPassword: String,
        clientIp: String,
        userAgent: String?,
    ) {
        val tokenHash = sha256(requireToken(authorization))
        val user = identityRepository.findUserByValidTokenHash(tokenHash)
            ?: throw UnauthorizedException("Invalid or expired session")
        if (!passwordEncoder.matches(currentPassword, user.passwordHash)) {
            throw UnauthorizedException("Invalid credentials")
        }
        validatePassword(newPassword, user.email)
        identityRepository.updatePasswordHash(user.id, passwordEncoder.encode(newPassword))
        identityRepository.deleteOtherSessions(user.id, tokenHash)
        authAudit.record("password_changed", user.id, user.id, user.email, clientIp, userAgent)
    }

    fun requestPasswordReset(email: String, clientIp: String, userAgent: String?) {
        val user = identityRepository.findUserByEmail(email.trim().lowercase())
        if (user == null || !user.enabled) {
            return
        }
        issueResetToken(user)
        authAudit.record("password_reset_requested", user.id, user.id, user.email, clientIp, userAgent)
    }

    @Transactional
    fun issuePasswordReset(
        authorization: String?,
        userId: UUID,
        clientIp: String,
        userAgent: String?,
    ): PasswordResetIssuedDto {
        val admin = requireAdmin(authorization)
        val user = identityRepository.findUserById(userId) ?: throw BadRequestException("Unknown user")
        if (!user.enabled) {
            throw BadRequestException("Cannot reset a disabled or invited account")
        }
        val (token, expiresAt) = issueResetToken(user)
        authAudit.record(
            "password_reset_requested",
            user.id,
            admin.id,
            admin.email,
            clientIp,
            userAgent,
            mapOf("issuedByAdmin" to true),
        )
        return PasswordResetIssuedDto(resetToken = token, expiresAt = expiresAt.atOffset(ZoneOffset.UTC))
    }

    @Transactional
    fun confirmPasswordReset(token: String, newPassword: String, clientIp: String, userAgent: String?) {
        val reset = identityRepository.findPasswordResetByTokenHash(sha256(token.trim()))
            ?: throw BadRequestException("Invalid or expired reset token")
        if (reset.usedAt != null || reset.expiresAt.isBefore(Instant.now())) {
            throw BadRequestException("Invalid or expired reset token")
        }
        val user = identityRepository.findUserById(reset.userId)
            ?: throw BadRequestException("Invalid or expired reset token")
        validatePassword(newPassword, user.email)
        identityRepository.updatePasswordHash(user.id, passwordEncoder.encode(newPassword))
        identityRepository.deleteSessionsForUser(user.id)
        identityRepository.markPasswordResetUsed(reset.id)
        authAudit.record("password_reset_completed", user.id, user.id, user.email, clientIp, userAgent)
    }

    fun validatePassword(password: String, email: String) {
        val normalized = password.trim()
        val localPart = email.substringBefore("@").lowercase()
        val common = normalized.lowercase() in COMMON_PASSWORDS
        val tooShort = normalized.length < 12
        val usesIdentity = localPart.length >= 4 && normalized.lowercase().contains(localPart)
        if (tooShort || common || usesIdentity) {
            throw BadRequestException("Password does not meet policy")
        }
    }

    private fun requireAdmin(authorization: String?): StoredUser {
        val user = identityRepository.findUserByValidTokenHash(sha256(requireToken(authorization)))
            ?: throw UnauthorizedException("Invalid or expired session")
        if ("admin" !in identityRepository.rolesForUser(user.id)) {
            throw ForbiddenException("Administrator role required")
        }
        return user
    }

    private fun toAdminDto(user: StoredUser): UserAdminDto {
        val unusedInvite = if (!user.enabled) identityRepository.findUnusedInvite(user.id) else null
        val status =
            when {
                user.enabled -> "active"
                unusedInvite != null -> "invited"
                else -> "disabled"
            }
        return UserAdminDto(
            id = user.id,
            email = user.email,
            roles = identityRepository.rolesForUser(user.id),
            enabled = user.enabled,
            status = status,
            createdAt = user.createdAt,
        )
    }

    private fun normalizeRoles(roles: List<String>): List<String> {
        val names = roles.map { it.trim().lowercase() }.filter { it.isNotBlank() }.distinct()
        if (names.isEmpty()) {
            throw BadRequestException("At least one role is required")
        }
        val allowed = setOf("admin", "editor", "reviewer", "publisher", "viewer")
        names.forEach { name ->
            if (name !in allowed) {
                throw BadRequestException("Unknown role")
            }
        }
        return names
    }

    private fun assignRoles(userId: UUID, roleNames: List<String>) {
        roleNames.forEach { roleName ->
            val roleId = identityRepository.findRoleId(roleName) ?: throw BadRequestException("Unknown role")
            identityRepository.assignRole(userId, roleId)
        }
    }

    private fun issueInviteToken(userId: UUID): Pair<String, Instant> {
        identityRepository.deleteUnusedInvites(userId)
        val token = newSecret()
        val expiresAt = Instant.now().plus(inviteTtl)
        identityRepository.insertInvite(userId, sha256(token), expiresAt)
        return token to expiresAt
    }

    private fun issueResetToken(user: StoredUser): Pair<String, Instant> {
        identityRepository.deleteUnusedResets(user.id)
        val token = newSecret()
        val expiresAt = Instant.now().plus(resetTtl)
        identityRepository.insertPasswordReset(user.id, sha256(token), expiresAt)
        if (logResetToken) {
            log.info("Password reset token issued for {} (non-production): {}", user.email, token)
        }
        return token to expiresAt
    }

    private fun requireToken(authorization: String?): String {
        val value = authorization?.trim().orEmpty()
        if (!value.startsWith("Bearer ")) {
            throw UnauthorizedException("Missing session")
        }
        return value.removePrefix("Bearer ").trim().ifBlank {
            throw UnauthorizedException("Missing session")
        }
    }

    private fun newSecret(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun hashToken(value: String): String = sha256(value)

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }

    companion object {
        private val COMMON_PASSWORDS =
            setOf(
                "password",
                "password123",
                "password1234",
                "changeme",
                "change-me",
                "change_me",
                "123456789012",
                "qwertyuiopas",
                "letmein12345",
                "adminadmin12",
                "welcome12345",
                "constitution",
                "constitution1",
            )
    }
}

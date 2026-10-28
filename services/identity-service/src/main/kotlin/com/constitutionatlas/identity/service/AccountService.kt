package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.ConflictException
import com.constitutionatlas.identity.MailDeliveryException
import com.constitutionatlas.identity.api.InviteCreatedDto
import com.constitutionatlas.identity.api.InviteRequest
import com.constitutionatlas.identity.api.PasswordResetIssuedDto
import com.constitutionatlas.identity.api.UserAdminDto
import com.constitutionatlas.identity.client.AuthAudit
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.crypto.encodeRequired
import com.constitutionatlas.identity.mail.OutboundMailer
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.StoredUser
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.UnauthorizedException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.SecureRandom
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@Service
class AccountService(
    private val identityRepository: IdentityRepository,
    private val passwordEncoder: PasswordEncoder,
    private val authAudit: AuthAudit,
    private val authService: AuthService,
    private val outboundMailer: OutboundMailer,
    private val settingsService: IdentitySettingsService,
    @Value("\${identity.invite.ttl:7d}") private val inviteTtl: Duration,
    @Value("\${identity.password.reset-ttl:1h}") private val resetTtl: Duration,
    @Value("\${identity.password.log-reset-token:false}") private val logResetToken: Boolean,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val random = SecureRandom()

    @Transactional
    fun register(emailInput: String, clientIp: String, userAgent: String?) {
        if (!settingsService.registrationEnabled()) throw ForbiddenException("Registration is closed")
        if (!outboundMailer.enabled) throw BadRequestException("Registration mail is unavailable")
        val email = emailInput.trim().lowercase()
        if (email.length > 254 || !email.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) {
            throw BadRequestException("A valid email is required")
        }
        val emailKey = "register:$email"
        val ipKey = "register-ip:${clientIp.ifBlank { "unknown" }}"
        authService.rejectLocked(emailKey, ipKey)
        authService.recordLockedFailure(emailKey, ipKey)
        val existing = identityRepository.findUserByEmail(email)
        if (existing != null && !identityRepository.hasPendingRegistration(existing.id)) return
        val userId = existing?.id ?: identityRepository.insertUser(email, passwordEncoder.encodeRequired(Tokens.urlToken(random)), enabled = false)
        if (existing == null) assignRoles(userId, listOf("viewer"))
        val token = Tokens.urlToken(random)
        identityRepository.insertRegistrationVerification(userId, Tokens.sha256Hex(token), Instant.now().plus(Duration.ofHours(24)))
        outboundMailer.sendRegistration(email, token)
        authAudit.record("registration_requested", userId, userId, email, clientIp, userAgent)
    }

    @Transactional
    fun confirmRegistration(token: String, password: String, clientIp: String, userAgent: String?) {
        val verification = identityRepository.findRegistrationVerification(Tokens.sha256Hex(token.trim()))
            ?: throw BadRequestException("Invalid or expired confirmation link")
        val user = identityRepository.lockUser(verification.userId)
            ?: throw BadRequestException("Invalid or expired confirmation link")
        if (user.enabled || !identityRepository.consumeRegistrationVerification(verification.id)) {
            throw BadRequestException("Invalid or expired confirmation link")
        }
        validatePassword(password, user.email)
        identityRepository.updatePasswordHash(user.id, passwordEncoder.encodeRequired(password))
        identityRepository.setEnabled(user.id, true)
        authAudit.record("registration_confirmed", user.id, user.id, user.email, clientIp, userAgent)
    }

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
        authService.requireFreshStepUp(authorization)
        val email = request.email.trim().lowercase()
        if (email.isBlank() || !email.contains("@")) {
            throw BadRequestException("A valid email is required")
        }
        val roleNames = normalizeRoles(request.roles)
        val existing = identityRepository.findUserByEmail(email)?.let { identityRepository.lockUser(it.id) }
        val userId =
            if (existing != null) {
                if (existing.enabled || identityRepository.findUnusedInvite(existing.id) == null) {
                    throw ConflictException("User already exists")
                }
                identityRepository.clearRoles(existing.id)
                assignRoles(existing.id, roleNames)
                existing.id
            } else {
                val id = identityRepository.insertUser(email, passwordEncoder.encodeRequired(Tokens.urlToken(random)), enabled = false)
                assignRoles(id, roleNames)
                id
            }
        val (token, expiresAt) = issueInviteToken(userId)
        val user = identityRepository.findUserById(userId) ?: throw BadRequestException("Unknown user")
        deliverInvite(user.email, token)
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
        val invite = identityRepository.findInviteByTokenHash(Tokens.sha256Hex(token.trim()))
            ?: throw BadRequestException("Invalid or expired invite")
        if (invite.usedAt != null || invite.expiresAt.isBefore(Instant.now())) {
            throw BadRequestException("Invalid or expired invite")
        }
        val user = identityRepository.lockUser(invite.userId)
            ?: throw BadRequestException("Invalid or expired invite")
        validatePassword(password, user.email)
        if (user.enabled || !identityRepository.consumeInvite(invite.id)) throw BadRequestException("Invalid or expired invite")
        identityRepository.updatePasswordHash(user.id, passwordEncoder.encodeRequired(password))
        identityRepository.setEnabled(user.id, true)
        authAudit.record("user_activated", user.id, user.id, user.email, clientIp, userAgent)
        return toAdminDto(identityRepository.findUserById(user.id)!!)
    }

    @Transactional
    fun disable(authorization: String?, userId: UUID, clientIp: String, userAgent: String?): UserAdminDto {
        val admin = requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        if (admin.id == userId) {
            throw BadRequestException("Cannot disable your own account")
        }
        val user = identityRepository.lockUser(userId) ?: throw BadRequestException("Unknown user")
        identityRepository.setEnabled(userId, false)
        identityRepository.deletePendingRegistrations(userId)
        identityRepository.deleteUnusedInvites(userId)
        identityRepository.deleteUnusedResets(userId)
        authService.revokeCredentials(userId)
        authAudit.record("account_disabled", userId, admin.id, admin.email, clientIp, userAgent)
        return toAdminDto(identityRepository.findUserById(userId) ?: user.copy(enabled = false))
    }

    @Transactional
    fun enable(authorization: String?, userId: UUID, clientIp: String, userAgent: String?): UserAdminDto {
        val admin = requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        val user = identityRepository.lockUser(userId) ?: throw BadRequestException("Unknown user")
        if (identityRepository.findUnusedInvite(userId) != null) {
            throw BadRequestException("Invite has not been accepted")
        }
        if (identityRepository.hasPendingRegistration(userId)) {
            throw BadRequestException("Registration has not been confirmed")
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
        authService.requireFreshStepUp(authorization)
        identityRepository.lockUser(userId) ?: throw BadRequestException("Unknown user")
        val roleNames = normalizeRoles(roles)
        if (admin.id == userId && "admin" !in roleNames) {
            throw BadRequestException("Cannot remove your own administrator role")
        }
        identityRepository.clearRoles(userId)
        roleNames.forEach { roleName ->
            val roleId = identityRepository.findRoleId(roleName) ?: throw BadRequestException("Unknown role")
            identityRepository.assignRole(userId, roleId)
        }
        authService.revokeCredentials(userId)
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

    @Transactional(noRollbackFor = [UnauthorizedException::class, com.constitutionatlas.identity.TooManyRequestsException::class])
    fun changePassword(
        authorization: String?,
        currentPassword: String,
        newPassword: String,
        clientIp: String,
        userAgent: String?,
    ) {
        val tokenHash = Tokens.sha256Hex(Tokens.requireBearer(authorization))
        val user = authService.requireLockedSession(authorization)
        authService.verifyPassword(user, currentPassword)
        validatePassword(newPassword, user.email)
        identityRepository.updatePasswordHash(user.id, passwordEncoder.encodeRequired(newPassword))
        authService.revokeCredentials(user.id, tokenHash)
        identityRepository.deleteUnusedResets(user.id)
        identityRepository.deleteUnusedInvites(user.id)
        authAudit.record("password_changed", user.id, user.id, user.email, clientIp, userAgent)
    }

    @Transactional
    fun requestPasswordReset(email: String, clientIp: String, userAgent: String?) {
        val normalized = email.trim().lowercase()
        val emailKey = "reset:$normalized"
        val ipKey = "reset-ip:${clientIp.ifBlank { "unknown" }}"
        authService.rejectLocked(emailKey, ipKey)
        authService.recordLockedFailure(emailKey, ipKey)
        val user = identityRepository.findUserByEmail(normalized)?.let { identityRepository.lockUser(it.id) }
        if (user == null || !user.enabled) {
            return
        }
        val (token, _) = issueResetToken(user)
        try {
            deliverReset(user, token)
        } catch (_: MailDeliveryException) {
            log.warn("Password reset mail could not be delivered")
        }
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
        authService.requireFreshStepUp(authorization)
        val user = identityRepository.lockUser(userId) ?: throw BadRequestException("Unknown user")
        if (!user.enabled) {
            throw BadRequestException("Cannot reset a disabled or invited account")
        }
        val (token, expiresAt) = issueResetToken(user)
        deliverReset(user, token)
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
        val reset = identityRepository.findPasswordResetByTokenHash(Tokens.sha256Hex(token.trim()))
            ?: throw BadRequestException("Invalid or expired reset token")
        if (reset.usedAt != null || reset.expiresAt.isBefore(Instant.now())) {
            throw BadRequestException("Invalid or expired reset token")
        }
        val user = identityRepository.lockUser(reset.userId)?.takeIf { it.enabled }
            ?: throw BadRequestException("Invalid or expired reset token")
        validatePassword(newPassword, user.email)
        if (!identityRepository.consumePasswordReset(reset.id)) throw BadRequestException("Invalid or expired reset token")
        identityRepository.updatePasswordHash(user.id, passwordEncoder.encodeRequired(newPassword))
        authService.revokeCredentials(user.id)
        identityRepository.deleteUnusedResets(user.id)
        identityRepository.deleteUnusedInvites(user.id)
        authAudit.record("password_reset_completed", user.id, user.id, user.email, clientIp, userAgent)
    }

    fun validatePassword(password: String, email: String) {
        val normalized = password.trim()
        val localPart = email.substringBefore("@").lowercase()
        val common = normalized.lowercase() in COMMON_PASSWORDS
        val tooShort = normalized.length < 12
        val tooLong = password.toByteArray(Charsets.UTF_8).size > 72
        val usesIdentity = localPart.length >= 4 && normalized.lowercase().contains(localPart)
        if (tooShort || tooLong || common || usesIdentity) {
            throw BadRequestException("Password does not meet policy")
        }
    }

    private fun requireAdmin(authorization: String?): StoredUser = authService.requireAdminSession(authorization)

    private fun toAdminDto(user: StoredUser): UserAdminDto {
        val unusedInvite = if (!user.enabled) identityRepository.findUnusedInvite(user.id) else null
        val pendingRegistration = if (!user.enabled) identityRepository.hasPendingRegistration(user.id) else false
        val status =
            when {
                user.enabled -> "active"
                unusedInvite != null -> "invited"
                pendingRegistration -> "pending_confirmation"
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
        val token = Tokens.urlToken(random)
        val expiresAt = Instant.now().plus(inviteTtl)
        identityRepository.insertInvite(userId, Tokens.sha256Hex(token), expiresAt)
        return token to expiresAt
    }

    private fun issueResetToken(user: StoredUser): Pair<String, Instant> {
        identityRepository.deleteUnusedResets(user.id)
        val token = Tokens.urlToken(random)
        val expiresAt = Instant.now().plus(resetTtl)
        identityRepository.insertPasswordReset(user.id, Tokens.sha256Hex(token), expiresAt)
        return token to expiresAt
    }

    private fun deliverInvite(email: String, token: String) {
        outboundMailer.sendInvite(email, token)
        if (!outboundMailer.enabled) {
            log.warn("Invite issued for {} but SMTP is not configured; deliver the token out of band", email)
        }
    }

    private fun deliverReset(user: StoredUser, token: String) {
        outboundMailer.sendPasswordReset(user.email, token)
        when {
            outboundMailer.enabled -> return
            logResetToken ->
                log.info("Password reset token issued for {} (non-production): {}", user.email, token)
            else ->
                log.warn(
                    "Password reset issued for {} but SMTP is not configured; token was not delivered",
                    user.email,
                )
        }
    }

    fun hashToken(value: String): String = Tokens.sha256Hex(value)

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

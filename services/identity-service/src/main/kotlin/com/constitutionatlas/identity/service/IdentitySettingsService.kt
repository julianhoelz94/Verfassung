package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.api.IdentitySettingsDto
import com.constitutionatlas.identity.api.UpdateIdentitySettingsRequest
import com.constitutionatlas.identity.config.IdentityMfaProperties
import com.constitutionatlas.identity.crypto.SecretBox
import com.constitutionatlas.identity.mail.OutboundMailer
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.IdentitySettingsRepository
import com.constitutionatlas.identity.repo.StoredIdentitySettings
import com.constitutionatlas.platform.ForbiddenException
import org.springframework.core.env.Environment
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URI

@Service
class IdentitySettingsService(
    private val repository: IdentitySettingsRepository,
    private val identityRepository: IdentityRepository,
    private val authService: AuthService,
    private val environment: Environment,
    mfaProperties: IdentityMfaProperties,
    private val environmentSettings: com.constitutionatlas.identity.setup.SettingsEnvironment,
) {
    private val box = SecretBox(mfaProperties.encryptionKey)

    fun registrationEnabled(): Boolean = environmentSettings.effective(repository.get()).selfRegistrationEnabled

    fun publicRegistrationStatus(): Map<String, Boolean> = mapOf("enabled" to registrationEnabled())

    fun currentMail(): com.constitutionatlas.identity.config.IdentityMailProperties {
        val current = environmentSettings.effective(repository.get())
        return com.constitutionatlas.identity.config.IdentityMailProperties(
            enabled = current.mailEnabled,
            from = current.mailFrom,
            fromName = current.mailFromName,
            publicBaseUrl = current.mailPublicBaseUrl,
            host = current.smtpHost,
            port = current.smtpPort,
            username = current.smtpUsername,
            password = current.smtpPasswordCipher?.let(box::decrypt) ?: "",
            auth = current.smtpAuth,
            startTls = current.smtpStarttls,
            ssl = current.smtpSsl,
        )
    }

    fun read(authorization: String?): IdentitySettingsDto {
        requireAdmin(authorization)
        return dto(environmentSettings.effective(repository.get()))
    }

    @Transactional
    fun update(authorization: String?, incoming: UpdateIdentitySettingsRequest): IdentitySettingsDto {
        val request = environmentSettings.request(incoming)
        requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        val old = environmentSettings.effective(repository.get())
        val host = request.smtpHost.trim()
        val from = request.mailFrom.trim()
        val base = request.mailPublicBaseUrl.trim().trimEnd('/')
        val uri = runCatching { URI(base) }.getOrNull()
        if (request.smtpPort !in 1..65535 || host.length > 255 || from.length > 254 || !from.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) {
            if (request.mailEnabled || request.selfRegistrationEnabled) throw BadRequestException("Invalid mail settings")
        }
        if (request.mailEnabled || request.selfRegistrationEnabled) {
            if (host.isBlank() ||
                !host.matches(Regex("^[A-Za-z0-9.-]+$")) ||
                uri?.scheme !in setOf("https", "http") ||
                uri?.host.isNullOrBlank() ||
                (uri?.scheme == "http" && uri.host !in setOf("localhost", "127.0.0.1")) ||
                uri?.rawUserInfo != null ||
                uri?.rawQuery != null ||
                uri?.rawFragment != null ||
                (uri?.rawPath?.isNotEmpty() == true)
            ) {
                throw BadRequestException("A valid HTTPS public URL and SMTP host are required")
            }
            if (request.smtpSsl && request.smtpStarttls) throw BadRequestException("Choose one SMTP TLS mode")
            if (!request.smtpSsl && !request.smtpStarttls && !environment.activeProfiles.contains("ci")) {
                throw BadRequestException("SMTP TLS is required")
            }
        }
        if (request.selfRegistrationEnabled && !request.mailEnabled) {
            throw BadRequestException("Configure and enable mail before opening registration")
        }
        val cipher = when {
            request.clearSmtpPassword -> null
            !request.smtpPassword.isNullOrBlank() -> box.encrypt(request.smtpPassword)
            else -> old.smtpPasswordCipher
        }
        if (request.mailEnabled && request.smtpAuth && (request.smtpUsername.isBlank() || cipher == null)) {
            throw BadRequestException("SMTP authentication requires a username and password")
        }
        val updated = StoredIdentitySettings(
            request.selfRegistrationEnabled,
            request.mailEnabled,
            from,
            request.mailFromName.trim(),
            base,
            host,
            request.smtpPort,
            request.smtpUsername.trim(),
            cipher,
            request.smtpAuth,
            request.smtpStarttls,
            request.smtpSsl,
        )
        repository.update(environmentSettings.writable(updated, repository.get()))
        return dto(environmentSettings.effective(repository.get()))
    }

    fun testMail(authorization: String?, to: String, mailer: OutboundMailer) {
        val admin = requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        val address = to.trim()
        if (address.length > 254 || !address.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) {
            throw BadRequestException("A valid recipient address is required")
        }
        val throttleKey = "test-mail:${admin.id}"
        authService.rejectLocked(throttleKey)
        authService.recordLockedFailure(throttleKey)
        mailer.sendTest(address)
    }

    private fun requireAdmin(authorization: String?): com.constitutionatlas.identity.repo.StoredUser {
        val user = authService.requireSession(authorization)
        if ("admin" !in identityRepository.rolesForUser(user.id)) throw ForbiddenException("Administrator role required")
        return user
    }

    private fun dto(current: StoredIdentitySettings) = IdentitySettingsDto(
        selfRegistrationEnabled = current.selfRegistrationEnabled,
        mailEnabled = current.mailEnabled,
        mailFrom = current.mailFrom,
        mailFromName = current.mailFromName,
        mailPublicBaseUrl = current.mailPublicBaseUrl,
        smtpHost = current.smtpHost,
        smtpPort = current.smtpPort,
        smtpUsername = current.smtpUsername,
        smtpPasswordSet = current.smtpPasswordCipher != null,
        smtpAuth = current.smtpAuth,
        smtpStarttls = current.smtpStarttls,
        smtpSsl = current.smtpSsl,
    )
}

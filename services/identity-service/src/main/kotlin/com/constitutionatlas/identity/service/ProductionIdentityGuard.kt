package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.config.IdentityMailProperties
import com.constitutionatlas.identity.config.IdentityMfaProperties
import com.constitutionatlas.identity.config.IdentitySeedProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Profile
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import java.util.Base64

@Component
@Profile("production")
@Order(Ordered.HIGHEST_PRECEDENCE)
class ProductionIdentityGuard(
    private val seedProperties: IdentitySeedProperties,
    private val mfaProperties: IdentityMfaProperties = IdentityMfaProperties(),
    @Value("\${identity.password.log-reset-token:false}") private val logResetToken: Boolean = false,
    private val mailProperties: IdentityMailProperties = IdentityMailProperties(),
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val mode = seedProperties.mode.trim().lowercase()
        if (mode != "off") {
            throw IllegalStateException("Production identity.seed.mode must be off")
        }
        val key = mfaProperties.encryptionKey.trim()
        if (key.isBlank() || key == "local-mfa-dev-key") {
            throw IllegalStateException("Production requires IDENTITY_MFA_ENCRYPTION_KEY")
        }
        val decoded = runCatching { Base64.getDecoder().decode(key) }.getOrNull()
        if (decoded == null || decoded.size != 32) {
            throw IllegalStateException("IDENTITY_MFA_ENCRYPTION_KEY must be 32-byte base64 (openssl rand -base64 32)")
        }
        if (logResetToken) {
            throw IllegalStateException("Production must not log password reset tokens")
        }
        if (!mailProperties.configured()) {
            throw IllegalStateException(
                "Production requires SMTP_HOST, IDENTITY_MAIL_FROM, and PUBLIC_BASE_URL",
            )
        }
        val demoEmails =
            listOf(
                seedProperties.editorEmail,
                seedProperties.reviewerEmail,
                seedProperties.publisherEmail,
                seedProperties.adminEmail,
                seedProperties.viewerEmail,
            )
        val demoPasswords =
            listOf(
                seedProperties.editorPassword,
                seedProperties.reviewerPassword,
                seedProperties.publisherPassword,
                seedProperties.adminPassword,
                seedProperties.viewerPassword,
            )
        if (demoEmails.any { it.contains("example.local", ignoreCase = true) }) {
            throw IllegalStateException("Production rejects demo seed emails")
        }
        if (demoPasswords.any { it.equals("change-me", ignoreCase = true) || it.equals("use-secret-store", ignoreCase = true) }) {
            throw IllegalStateException("Production rejects default/demo credentials")
        }
        if (seedProperties.serviceToken.isNotBlank()) {
            throw IllegalStateException("Production does not seed service tokens")
        }
    }
}

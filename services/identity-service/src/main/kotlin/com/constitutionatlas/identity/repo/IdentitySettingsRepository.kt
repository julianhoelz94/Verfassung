package com.constitutionatlas.identity.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

data class StoredIdentitySettings(
    val selfRegistrationEnabled: Boolean,
    val mailEnabled: Boolean,
    val mailFrom: String,
    val mailFromName: String,
    val mailPublicBaseUrl: String,
    val smtpHost: String,
    val smtpPort: Int,
    val smtpUsername: String,
    val smtpPasswordCipher: String?,
    val smtpAuth: Boolean,
    val smtpStarttls: Boolean,
    val smtpSsl: Boolean,
)

@Repository
class IdentitySettingsRepository(private val jdbc: JdbcTemplate) {
    fun get(): StoredIdentitySettings =
        jdbc.queryForObject(
            "SELECT * FROM identity_settings WHERE id = TRUE",
        ) { rs, _ ->
            StoredIdentitySettings(
                rs.getBoolean("self_registration_enabled"),
                rs.getBoolean("mail_enabled"),
                rs.getString("mail_from"),
                rs.getString("mail_from_name"),
                rs.getString("mail_public_base_url"),
                rs.getString("smtp_host"),
                rs.getInt("smtp_port"),
                rs.getString("smtp_username"),
                rs.getString("smtp_password_cipher"),
                rs.getBoolean("smtp_auth"),
                rs.getBoolean("smtp_starttls"),
                rs.getBoolean("smtp_ssl"),
            )
        }!!

    fun update(settings: StoredIdentitySettings) {
        jdbc.update(
            """
            UPDATE identity_settings SET
              self_registration_enabled = ?, mail_enabled = ?, mail_from = ?, mail_from_name = ?,
              mail_public_base_url = ?, smtp_host = ?, smtp_port = ?, smtp_username = ?,
              smtp_password_cipher = ?, smtp_auth = ?, smtp_starttls = ?, smtp_ssl = ?, updated_at = NOW()
            WHERE id = TRUE
            """.trimIndent(),
            settings.selfRegistrationEnabled,
            settings.mailEnabled,
            settings.mailFrom,
            settings.mailFromName,
            settings.mailPublicBaseUrl,
            settings.smtpHost,
            settings.smtpPort,
            settings.smtpUsername,
            settings.smtpPasswordCipher,
            settings.smtpAuth,
            settings.smtpStarttls,
            settings.smtpSsl,
        )
    }
}

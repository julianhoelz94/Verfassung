package com.constitutionatlas.identity.setup

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

data class SetupState(
    val bootstrapAdminId: UUID?,
    val completedAt: OffsetDateTime?,
    val legacyInstallation: Boolean,
    val mailDeferred: Boolean,
    val accessReviewed: Boolean,
    val enabledLanguages: List<String>,
    val defaultLanguage: String,
)

@Repository
class SetupRepository(private val jdbc: JdbcTemplate) {
    fun get(lock: Boolean = false): SetupState = jdbc.queryForObject(
        "SELECT * FROM deployment_setup WHERE id = TRUE" + if (lock) " FOR UPDATE" else "",
    ) { rs, _ ->
        SetupState(
            rs.getObject("bootstrap_admin_id", UUID::class.java),
            rs.getObject("completed_at", OffsetDateTime::class.java),
            rs.getBoolean("legacy_installation"),
            rs.getBoolean("mail_deferred"),
            rs.getBoolean("access_reviewed"),
            (rs.getArray("enabled_languages").array as Array<*>).map { it.toString() },
            rs.getString("default_language"),
        )
    }!!

    fun designate(adminId: UUID) {
        jdbc.update("UPDATE deployment_setup SET bootstrap_admin_id = ? WHERE id = TRUE AND bootstrap_admin_id IS NULL", adminId)
    }

    fun languages(languages: List<String>, defaultLanguage: String) {
        jdbc.update { connection ->
            connection.prepareStatement("UPDATE deployment_setup SET enabled_languages = ?, default_language = ?, updated_at = NOW() WHERE id = TRUE").apply {
                setArray(1, connection.createArrayOf("text", languages.toTypedArray()))
                setString(2, defaultLanguage)
            }
        }
    }

    fun preferences(mailDeferred: Boolean, accessReviewed: Boolean) {
        jdbc.update("UPDATE deployment_setup SET mail_deferred = ?, access_reviewed = ?, updated_at = NOW() WHERE id = TRUE", mailDeferred, accessReviewed)
    }

    fun complete() {
        jdbc.update("UPDATE deployment_setup SET completed_at = COALESCE(completed_at, NOW()), updated_at = NOW() WHERE id = TRUE")
    }
}

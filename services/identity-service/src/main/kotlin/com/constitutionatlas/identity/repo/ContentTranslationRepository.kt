package com.constitutionatlas.identity.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

data class TranslationSiteSettings(val provider: String, val sharedKeyCipher: String?)
data class TranslationUserSettings(val alwaysTranslate: Boolean, val googleKeyCipher: String?)

@Repository
class ContentTranslationRepository(private val jdbc: JdbcTemplate) {
    fun site(): TranslationSiteSettings = jdbc.query(
        "SELECT provider, shared_key_cipher FROM content_translation_settings WHERE id = TRUE",
        { rs, _ -> TranslationSiteSettings(rs.getString("provider"), rs.getString("shared_key_cipher")) },
    ).single()

    fun updateSite(provider: String, cipher: String?) {
        jdbc.update("UPDATE content_translation_settings SET provider = ?, shared_key_cipher = ? WHERE id = TRUE", provider, cipher)
    }

    fun user(userId: UUID): TranslationUserSettings = jdbc.query(
        "SELECT always_translate, google_key_cipher FROM user_content_translation_settings WHERE user_id = ?",
        { rs, _ -> TranslationUserSettings(rs.getBoolean("always_translate"), rs.getString("google_key_cipher")) },
        userId,
    ).firstOrNull() ?: TranslationUserSettings(false, null)

    fun updateUser(userId: UUID, alwaysTranslate: Boolean, cipher: String?) {
        jdbc.update(
            """INSERT INTO user_content_translation_settings (user_id, always_translate, google_key_cipher)
               VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET
               always_translate = EXCLUDED.always_translate, google_key_cipher = EXCLUDED.google_key_cipher""",
            userId,
            alwaysTranslate,
            cipher,
        )
    }

    fun cached(scope: String, provider: String, hash: String, source: String, target: String): String? = jdbc.query(
        """SELECT translated_text FROM content_translation_cache
           WHERE scope = ? AND provider = ? AND source_hash = ? AND source_language = ? AND target_language = ?""",
        { rs, _ -> rs.getString("translated_text") },
        scope,
        provider,
        hash,
        source,
        target,
    ).firstOrNull()

    fun cache(scope: String, provider: String, hash: String, source: String, target: String, translated: String) {
        jdbc.update(
            """INSERT INTO content_translation_cache
               (scope, provider, source_hash, source_language, target_language, translated_text)
               VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING""",
            scope,
            provider,
            hash,
            source,
            target,
            translated,
        )
    }

    /** Reserve before the provider request. Failed requests keep their reservation, so concurrent traffic never exceeds the cap. */
    @Transactional
    fun reserveSharedGoogle(month: String, characters: Int): Boolean {
        jdbc.queryForObject("SELECT id FROM content_translation_settings WHERE id = TRUE FOR UPDATE", Boolean::class.java)
        val rolling = jdbc.queryForObject(
            "SELECT COALESCE(SUM(characters), 0) FROM content_translation_google_reservations WHERE reserved_at >= now() - interval '31 days'",
            Long::class.java,
        ) ?: 0L
        if (rolling + characters > 500_000) return false
        jdbc.update("INSERT INTO content_translation_google_usage (billing_month) VALUES (?) ON CONFLICT DO NOTHING", month)
        val accepted = jdbc.update(
            """UPDATE content_translation_google_usage SET reserved_characters = reserved_characters + ?
               WHERE billing_month = ? AND reserved_characters + ? <= 500000""",
            characters,
            month,
            characters,
        ) == 1
        if (accepted) jdbc.update("INSERT INTO content_translation_google_reservations(characters) VALUES (?)", characters)
        return accepted
    }

    fun googleUsed(month: String): Int = jdbc.query(
        "SELECT reserved_characters FROM content_translation_google_usage WHERE billing_month = ?",
        { rs, _ -> rs.getInt(1) },
        month,
    ).firstOrNull() ?: 0
}

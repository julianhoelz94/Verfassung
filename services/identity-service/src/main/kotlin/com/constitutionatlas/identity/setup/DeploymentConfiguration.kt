package com.constitutionatlas.identity.setup

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.core.env.Environment
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component
import java.net.URI

data class SettingDescriptor(val key: String, val group: String, val environment: String, val optional: Boolean, val secret: Boolean = false)
data class SettingStatus(val key: String, val group: String, val source: String, val optional: Boolean, val configured: Boolean, val editable: Boolean)
data class LanguagePolicy(val supported: List<String>, val enabled: List<String>, val defaultLanguage: String, val managed: Boolean)

@Component
class DeploymentConfiguration(private val environment: Environment, mapper: ObjectMapper) {
    val supported: List<String> = mapper.readValue(ClassPathResource("supported-languages.json").inputStream, Array<String>::class.java).toList()
    val tlsMode: String = value("TLS_MODE") ?: "local-http"
    val publicUrl: String = value("PUBLIC_BASE_URL") ?: "http://localhost"
    val production: Boolean get() = environment.activeProfiles.contains("production")
    val fixture: Boolean get() = value("SETUP_FIXTURE_COMPLETE") == "true"
    fun value(key: String): String? = environment.getProperty(key)?.trim()?.takeIf { it.isNotEmpty() }

    fun validateTransport() {
        check(tlsMode in setOf("local-http", "local-https", "managed-acme", "external-proxy")) { "Invalid TLS_MODE" }
        val uri = URI(publicUrl)
        check(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null && uri.path.orEmpty() in setOf("", "/")) { "PUBLIC_BASE_URL must be a canonical origin" }
        if (tlsMode.startsWith("local-")) {
            check(!production && environment.activeProfiles.any { it in setOf("local-stack", "testing", "ci") }) { "Local TLS modes require an explicit development profile" }
            check(uri.host in setOf("localhost", "127.0.0.1", "::1", "[::1]")) { "Local modes require a loopback public URL" }
        }
        check(uri.scheme == if (tlsMode == "local-http") "http" else "https") { "PUBLIC_BASE_URL scheme does not match TLS_MODE" }
        if (production) check(value("SESSION_COOKIE_SECURE") != "false") { "Production requires secure cookies" }
        if (fixture) check(!production && environment.activeProfiles.any { it in setOf("local-stack", "testing", "ci") }) { "Setup fixtures are development-only" }
    }

    fun languages(state: SetupState): LanguagePolicy {
        val override = value("SITE_LANGUAGES")?.split(',')?.map { it.trim() }
        val enabled = override ?: state.enabledLanguages.ifEmpty { supported }
        val defaultLanguage = value("SITE_DEFAULT_LANGUAGE") ?: state.defaultLanguage.ifBlank { enabled.first() }
        require(enabled.isNotEmpty() && enabled.distinct().size == enabled.size && enabled.all { it in supported } && defaultLanguage in enabled) { "Invalid site language policy" }
        return LanguagePolicy(supported, enabled, defaultLanguage, override != null || value("SITE_DEFAULT_LANGUAGE") != null)
    }

    companion object {
        val descriptors = listOf(
            SettingDescriptor("languages", "general", "SITE_LANGUAGES", true),
            SettingDescriptor("defaultLanguage", "general", "SITE_DEFAULT_LANGUAGE", true),
            SettingDescriptor("selfRegistrationEnabled", "access", "SITE_REGISTRATION_ENABLED", true),
            SettingDescriptor("mailEnabled", "email", "SMTP_ENABLED", true),
            SettingDescriptor("mailFrom", "email", "SMTP_FROM", true),
            SettingDescriptor("mailFromName", "email", "SMTP_FROM_NAME", true),
            SettingDescriptor("mailPublicBaseUrl", "email", "SMTP_PUBLIC_BASE_URL", true),
            SettingDescriptor("smtpHost", "email", "SMTP_HOST", true),
            SettingDescriptor("smtpPort", "email", "SMTP_PORT", true),
            SettingDescriptor("smtpUsername", "email", "SMTP_USERNAME", true),
            SettingDescriptor("smtpPassword", "email", "SMTP_PASSWORD", true, true),
            SettingDescriptor("smtpAuth", "email", "SMTP_AUTH", true),
            SettingDescriptor("smtpStarttls", "email", "SMTP_STARTTLS", true),
            SettingDescriptor("smtpSsl", "email", "SMTP_SSL", true),
        )
    }
}

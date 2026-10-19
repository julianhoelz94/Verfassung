package com.constitutionatlas.identity.setup

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.service.AuthService
import com.constitutionatlas.identity.service.IdentitySettingsService
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.timedRestClient
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestClientResponseException

// Public status deliberately contains no settings or administrator identity.
data class SetupStatus(val completed: Boolean, val tlsMode: String, val publicUrl: String)
data class SetupPreferences(val mailDeferred: Boolean, val accessReviewed: Boolean, val enabledLanguages: List<String>, val defaultLanguage: String)
data class SetupDetails(
    val status: SetupStatus,
    val preferences: SetupPreferences,
    val languages: LanguagePolicy,
    val settings: List<SettingStatus>,
    val required: List<String>,
    val completedAt: String?,
    val legacyInstallation: Boolean,
)

@Service
class SetupService(
    private val repository: SetupRepository,
    private val configuration: DeploymentConfiguration,
    private val auth: AuthService,
    private val settings: IdentitySettingsService,
    private val managed: SettingsEnvironment,
    @Value("\${DOCUMENT_API_URL:http://localhost/api/document}") documentUrl: String,
) {
    private val document = timedRestClient(documentUrl)
    fun status(): SetupStatus = SetupStatus(repository.get().completedAt != null, configuration.tlsMode, configuration.publicUrl)
    fun languages(): LanguagePolicy = configuration.languages(repository.get())

    fun read(authorization: String?): SetupDetails {
        requireAdmin(authorization)
        val state = repository.get()
        val policy = configuration.languages(state)
        val mail = settings.read(authorization)
        val values: Map<String, Boolean> = mapOf(
            "mailEnabled" to mail.mailEnabled,
            "mailFrom" to mail.mailFrom.isNotBlank(),
            "smtpHost" to mail.smtpHost.isNotBlank(),
            "smtpUsername" to mail.smtpUsername.isNotBlank(),
            "smtpPassword" to mail.smtpPasswordSet,
            "mailPublicBaseUrl" to mail.mailPublicBaseUrl.isNotBlank(),
        )
        val fields = DeploymentConfiguration.descriptors.map {
            val environment = it.key in managed.managedKeys()
            SettingStatus(it.key, it.group, if (environment) "environment" else "saved-or-default", it.optional, values[it.key] ?: true, !environment)
        }
        return SetupDetails(
            status(),
            SetupPreferences(state.mailDeferred, state.accessReviewed, policy.enabled, policy.defaultLanguage),
            policy,
            fields,
            missing(authorization, state),
            state.completedAt?.toString(),
            state.legacyInstallation,
        )
    }

    @Transactional
    fun save(authorization: String?, request: SetupPreferences): SetupDetails {
        requireAdmin(authorization)
        auth.requireFreshStepUp(authorization)
        repository.get(lock = true)
        val policy = languages()
        if (policy.managed && (request.enabledLanguages != policy.enabled || request.defaultLanguage != policy.defaultLanguage)) {
            throw BadRequestException("Languages are managed by deployment configuration")
        }
        if (request.enabledLanguages.isEmpty() || request.enabledLanguages.distinct().size != request.enabledLanguages.size ||
            request.enabledLanguages.any { it !in configuration.supported } || request.defaultLanguage !in request.enabledLanguages
        ) {
            throw BadRequestException("Choose at least one supported language and an enabled default")
        }
        if (request.mailDeferred && settings.read(authorization).selfRegistrationEnabled) throw BadRequestException("Disable self-registration before deferring email")
        repository.languages(request.enabledLanguages, request.defaultLanguage)
        repository.preferences(request.mailDeferred, request.accessReviewed)
        return read(authorization)
    }

    @Transactional
    fun complete(authorization: String?): SetupStatus {
        requireAdmin(authorization)
        auth.requireFreshStepUp(authorization)
        val state = repository.get(lock = true)
        if (state.completedAt != null) return status()
        val required = missing(authorization, state)
        if (required.isNotEmpty()) throw BadRequestException("Complete required setup: ${required.joinToString(", ")}")
        repository.complete()
        return status()
    }

    private fun missing(authorization: String?, state: SetupState): List<String> = buildList {
        if (state.completedAt != null) return@buildList
        if (!state.accessReviewed) add("access-review")
        val mail = settings.currentMail()
        if (!state.mailDeferred && !mail.configured()) add("email-or-defer")
        if (state.mailDeferred && settings.registrationEnabled()) add("disable-registration-before-deferring-email")
        if (!published("imprint-details", authorization)) add("operator-details")
        val keys = listOf("impressum", "datenschutz") + if ("en" in languages().enabled) listOf("impressum_en", "datenschutz_en") else emptyList()
        keys.filterNot { published(it, authorization) }.forEach { add("legal:$it") }
    }

    private fun published(key: String, authorization: String?): Boolean = try {
        document.get().uri("/legal-pages/$key").header("Authorization", authorization ?: "").retrieve().toBodilessEntity()
        true
    } catch (ex: RestClientResponseException) {
        if (ex.statusCode.value() == 404) false else throw ex
    }

    private fun requireAdmin(authorization: String?) {
        val user = auth.me(authorization)
        if ("admin" !in user.roles || user.scopes.isNotEmpty()) throw ForbiddenException("Administrator session required")
        val state = repository.get()
        if (state.completedAt == null && state.bootstrapAdminId != user.id) throw ForbiddenException("Bootstrap administrator required")
    }
}

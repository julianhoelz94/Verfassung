package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.TooManyRequestsException
import com.constitutionatlas.identity.api.ContentTranslationSiteDto
import com.constitutionatlas.identity.api.ContentTranslationUserDto
import com.constitutionatlas.identity.api.TranslateContentRequest
import com.constitutionatlas.identity.api.TranslateContentResponse
import com.constitutionatlas.identity.api.TranslateContentBatchRequest
import com.constitutionatlas.identity.api.TranslateContentBatchResponse
import com.constitutionatlas.identity.api.UpdateContentTranslationSiteRequest
import com.constitutionatlas.identity.api.UpdateContentTranslationUserRequest
import com.constitutionatlas.identity.config.IdentityMfaProperties
import com.constitutionatlas.identity.crypto.SecretBox
import com.constitutionatlas.identity.repo.ContentTranslationRepository
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.platform.ForbiddenException
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.time.YearMonth

@Service
class ContentTranslationService(
    private val repository: ContentTranslationRepository,
    private val identityRepository: IdentityRepository,
    private val authService: AuthService,
    private val providerClient: ContentTranslationProvider,
    mfaProperties: IdentityMfaProperties,
) {
    private val box = SecretBox(mfaProperties.encryptionKey)

    fun site(authorization: String?): ContentTranslationSiteDto {
        requireAdmin(authorization)
        return siteDto()
    }

    fun availability(): Map<String, Boolean> = mapOf("enabled" to (repository.site().provider != "off"))

    fun updateSite(authorization: String?, request: UpdateContentTranslationSiteRequest): ContentTranslationSiteDto {
        requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        if (request.provider !in setOf("off", "google", "deepl")) throw BadRequestException("Invalid translation provider")
        val old = repository.site()
        val key = when {
            request.clearSharedApiKey -> null
            !request.sharedApiKey.isNullOrBlank() -> box.encrypt(validateKey(request.sharedApiKey))
            request.provider == old.provider || request.provider == "off" -> old.sharedKeyCipher
            else -> null
        }
        if (request.provider != "off" && key == null) throw BadRequestException("Configure a provider API key before enabling translation")
        repository.updateSite(request.provider, key)
        return siteDto()
    }

    fun user(authorization: String?): ContentTranslationUserDto {
        val actor = authService.requireSession(authorization)
        val current = repository.user(actor.id)
        return ContentTranslationUserDto(current.alwaysTranslate, current.googleKeyCipher != null)
    }

    fun updateUser(authorization: String?, request: UpdateContentTranslationUserRequest): ContentTranslationUserDto {
        val actor = authService.requireSession(authorization)
        val old = repository.user(actor.id)
        val cipher = when {
            request.clearPersonalGoogleKey -> null
            !request.personalGoogleKey.isNullOrBlank() -> box.encrypt(validateKey(request.personalGoogleKey))
            else -> old.googleKeyCipher
        }
        repository.updateUser(actor.id, request.alwaysTranslate, cipher)
        return ContentTranslationUserDto(request.alwaysTranslate, cipher != null)
    }

    fun translate(authorization: String?, request: TranslateContentRequest): TranslateContentResponse {
        val result = translateBatch(authorization, TranslateContentBatchRequest(listOf(request.text), request.sourceLanguage, request.targetLanguage))
        return TranslateContentResponse(result.texts.single(), result.provider)
    }

    fun translateBatch(authorization: String?, request: TranslateContentBatchRequest): TranslateContentBatchResponse {
        val actor = authService.requireSession(authorization)
        val site = repository.site()
        if (site.provider == "off") throw ForbiddenException("Content translation is disabled")
        val texts = request.texts.map { it.trim() }
        if (texts.isEmpty() || texts.size > 128 || texts.any { it.isEmpty() } || texts.sumOf { it.length } > 20_000) {
            throw BadRequestException("Content batch must contain 1 to 128 nonempty texts and at most 20000 characters")
        }
        val source = request.sourceLanguage.lowercase().substringBefore('-')
        val target = request.targetLanguage.lowercase()
        if (!(source.matches(Regex("[a-z]{2,3}")) || source == "auto") || target !in setOf("en", "de") || source == target) {
            throw BadRequestException("Unsupported translation language pair")
        }
        val personal = repository.user(actor.id).googleKeyCipher
        val provider = if (personal != null) "google" else site.provider
        val cipher = personal ?: site.sharedKeyCipher ?: throw ForbiddenException("Translation provider is not configured")
        val scope = if (personal != null) actor.id.toString() else "shared"
        val unique = texts.distinct()
        val hashes = unique.associateWith { text ->
            MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }
        val translations = unique.mapNotNull { text ->
            repository.cached(scope, provider, hashes.getValue(text), source, target)?.let { text to it }
        }.toMap().toMutableMap()
        val missing = unique.filterNot { translations.containsKey(it) }
        if (provider == "google" && personal == null) {
            val characters = missing.sumOf { it.length }
            if (characters > 0 && !repository.reserveSharedGoogle(YearMonth.now(java.time.ZoneOffset.UTC).toString(), characters)) {
                throw TooManyRequestsException("Shared Google translation quota exhausted for this month")
            }
        }
        if (missing.isNotEmpty()) {
            val translated = try {
                providerClient.translateMany(provider, box.decrypt(cipher), missing, source, target)
            } catch (_: Exception) {
                throw BadRequestException("Translation provider unavailable")
            }
            missing.zip(translated).forEach { (text, result) ->
                repository.cache(scope, provider, hashes.getValue(text), source, target, result)
                translations[text] = result
            }
        }
        return TranslateContentBatchResponse(texts.map { translations.getValue(it) }, provider)
    }

    private fun siteDto(): ContentTranslationSiteDto {
        val current = repository.site()
        return ContentTranslationSiteDto(
            current.provider,
            current.sharedKeyCipher != null,
            repository.googleUsed(YearMonth.now(java.time.ZoneOffset.UTC).toString()),
        )
    }

    private fun requireAdmin(authorization: String?) {
        val actor = authService.requireSession(authorization)
        if ("admin" !in identityRepository.rolesForUser(actor.id)) throw ForbiddenException("Administrator role required")
    }

    private fun validateKey(value: String): String {
        val trimmed = value.trim()
        if (trimmed.length !in 10..300 || trimmed.any { it.isWhitespace() }) throw BadRequestException("Invalid translation API key")
        return trimmed
    }
}

package com.constitutionatlas.identity.service

import org.springframework.stereotype.Component
import org.springframework.web.util.HtmlUtils
import tools.jackson.databind.ObjectMapper
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

@Component
class ContentTranslationProvider(private val mapper: ObjectMapper) {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()

    /**
     * Translates one ordered batch using Google or DeepL, returning one text per input.
     * `auto` omits the source language so the provider detects it. Requests retain the
     * five-second connection and twenty-second request timeouts; transport failures propagate.
     *
     * @throws IllegalStateException for unsupported providers, non-success responses,
     * incomplete batches, or blank translated text.
     */
    fun translateMany(provider: String, apiKey: String, sourceTexts: List<String>, sourceLanguage: String, targetLanguage: String): List<String> {
        val request = buildRequest(provider, apiKey, sourceTexts, sourceLanguage, targetLanguage)
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        return translatedTexts(provider, response.statusCode(), response.body(), sourceTexts.size)
    }

    /**
     * Builds the provider-specific JSON request without sending it. Google keys are
     * URL-encoded; DeepL `:fx` keys use its free endpoint. Explicit language casing is
     * preserved for Google and uppercased for DeepL, while `auto` is omitted for both.
     *
     * @throws IllegalStateException when [provider] is neither `google` nor `deepl`.
     */
    internal fun buildRequest(provider: String, apiKey: String, sourceTexts: List<String>, sourceLanguage: String, targetLanguage: String): HttpRequest =
        when (provider) {
            "google" -> HttpRequest.newBuilder(
                URI.create("https://translation.googleapis.com/language/translate/v2?key=${URLEncoder.encode(apiKey, StandardCharsets.UTF_8)}"),
            ).header("Content-Type", "application/json")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        mapper.writeValueAsString(
                            mapOf(
                                "q" to sourceTexts,
                                "target" to targetLanguage,
                                "format" to "text",
                            ) + (if (sourceLanguage == "auto") emptyMap() else mapOf("source" to sourceLanguage)),
                        ),
                    ),
                ).timeout(Duration.ofSeconds(20)).build()
            "deepl" -> HttpRequest.newBuilder(
                URI.create(if (apiKey.endsWith(":fx")) "https://api-free.deepl.com/v2/translate" else "https://api.deepl.com/v2/translate"),
            ).header("Content-Type", "application/json")
                .header("Authorization", "DeepL-Auth-Key $apiKey")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        mapper.writeValueAsString(
                            mapOf(
                                "text" to sourceTexts,
                                "target_lang" to targetLanguage.uppercase(),
                            ) + (if (sourceLanguage == "auto") emptyMap() else mapOf("source_lang" to sourceLanguage.uppercase())),
                        ),
                    ),
                ).timeout(Duration.ofSeconds(20)).build()
            else -> error("Unsupported translation provider")
        }

    /**
     * Validates a successful provider response and preserves its translation order.
     * Google HTML entities are decoded; DeepL text is returned unchanged. Malformed
     * JSON propagates the mapper error; validation errors do not include the response body.
     *
     * @throws IllegalStateException for non-2xx status, a batch size different from
     * [expectedCount], or any missing/blank translated text.
     */
    internal fun translatedTexts(provider: String, statusCode: Int, body: String, expectedCount: Int): List<String> {
        if (statusCode !in 200..299) error("Translation provider unavailable")
        val root = mapper.readTree(body)
        val translations = if (provider == "google") root.path("data").path("translations") else root.path("translations")
        if (translations.size() != expectedCount) error("Translation provider returned an incomplete response")
        return translations.toList().map { entry ->
            val translated = entry.path(if (provider == "google") "translatedText" else "text").asString("")
            if (translated.isBlank()) error("Translation provider returned no text")
            if (provider == "google") HtmlUtils.htmlUnescape(translated) else translated
        }
    }
}

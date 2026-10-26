package com.constitutionatlas.identity.service

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import org.springframework.web.util.HtmlUtils
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

    fun translateMany(provider: String, apiKey: String, sourceTexts: List<String>, sourceLanguage: String, targetLanguage: String): List<String> {
        val request = when (provider) {
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
        val response = http.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299) error("Translation provider unavailable")
        val root = mapper.readTree(response.body())
        val translations = if (provider == "google") root.path("data").path("translations") else root.path("translations")
        if (translations.size() != sourceTexts.size) error("Translation provider returned an incomplete response")
        return translations.map { entry ->
            val translated = entry.path(if (provider == "google") "translatedText" else "text").asText("")
            if (translated.isBlank()) error("Translation provider returned no text")
            if (provider == "google") HtmlUtils.htmlUnescape(translated) else translated
        }
    }
}

import com.constitutionatlas.identity.service.ContentTranslationProvider
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import tools.jackson.core.JacksonException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.Flow
import java.util.concurrent.TimeUnit

/** Exercises provider wire contracts without sending requests to external translation services. */
class ContentTranslationProviderTest {
    private val mapper = JsonMapper()
    private val provider = ContentTranslationProvider(mapper)

    @Test
    fun googleRequestEscapesCredentialsAndPreservesOrderedTextsAndLanguageCasing() {
        val request = provider.buildRequest("google", "key +/&?=", listOf("First", "Zweite \"Zeile\""), "de", "en-US")

        assertEquals("https://translation.googleapis.com/language/translate/v2?key=key+%2B%2F%26%3F%3D", request.uri().toString())
        assertEquals("POST", request.method())
        assertEquals("application/json", request.headers().firstValue("Content-Type").orElseThrow())
        assertEquals(Duration.ofSeconds(20), request.timeout().orElseThrow())
        assertEquals(
            mapper.readTree("""{"q":["First","Zweite \"Zeile\""],"target":"en-US","format":"text","source":"de"}"""),
            requestBody(request),
        )
    }

    @Test
    fun automaticGoogleSourceIsOmitted() {
        val request = provider.buildRequest("google", "key", listOf("Text"), "auto", "en")
        assertFalse(requestBody(request).has("source"))
    }

    @Test
    fun paidDeeplRequestUsesAuthorizationHeaderAndUppercaseLanguages() {
        val request = provider.buildRequest("deepl", "paid-key", listOf("First", "Second"), "de", "en-US")

        assertEquals("https://api.deepl.com/v2/translate", request.uri().toString())
        assertEquals("POST", request.method())
        assertEquals("DeepL-Auth-Key paid-key", request.headers().firstValue("Authorization").orElseThrow())
        assertEquals("application/json", request.headers().firstValue("Content-Type").orElseThrow())
        assertEquals(Duration.ofSeconds(20), request.timeout().orElseThrow())
        assertEquals(
            mapper.readTree("""{"text":["First","Second"],"target_lang":"EN-US","source_lang":"DE"}"""),
            requestBody(request),
        )
    }

    @Test
    fun freeDeeplRequestOmitsAutomaticSourceLanguage() {
        val request = provider.buildRequest("deepl", "free-key:fx", listOf("Text"), "auto", "en-GB")

        assertEquals("https://api-free.deepl.com/v2/translate", request.uri().toString())
        assertEquals("DeepL-Auth-Key free-key:fx", request.headers().firstValue("Authorization").orElseThrow())
        assertEquals(mapper.readTree("""{"text":["Text"],"target_lang":"EN-GB"}"""), requestBody(request))
    }

    @Test
    fun unsupportedProvidersAreRejectedBeforeSending() {
        val failure = assertThrows(IllegalStateException::class.java) {
            provider.buildRequest("other", "key", listOf("Text"), "auto", "en")
        }
        assertEquals("Unsupported translation provider", failure.message)
    }

    @Test
    fun googleResponsesDecodeHtmlEntitiesAndPreserveBatchOrder() {
        val body = """{"data":{"translations":[{"translatedText":"A &amp; B"},{"translatedText":"&#39;Second&#39;"}]}}"""
        assertEquals(listOf("A & B", "'Second'"), provider.translatedTexts("google", 200, body, 2))
    }

    @Test
    fun deeplResponsesPreserveLiteralHtmlEntities() {
        val body = """{"translations":[{"text":"A &amp; B"},{"text":"Second"}]}"""
        assertEquals(listOf("A &amp; B", "Second"), provider.translatedTexts("deepl", 299, body, 2))
    }

    @Test
    fun providerFailuresAreRejectedBeforeReadingTheirBody() {
        for (status in listOf(199, 300, 401, 429, 503)) {
            val failure = assertThrows(IllegalStateException::class.java) {
                provider.translatedTexts("google", status, "not JSON: private provider detail", 1)
            }
            assertEquals("Translation provider unavailable", failure.message)
        }
    }

    @Test
    fun malformedSuccessfulResponsesKeepTheMapperFailure() {
        assertThrows(JacksonException::class.java) {
            provider.translatedTexts("google", 200, "{", 1)
        }
    }

    @Test
    fun incompleteAndOversizedBatchesAreRejected() {
        val body = """{"translations":[{"text":"One"}]}"""
        for (expectedCount in listOf(0, 2)) {
            val failure = assertThrows(IllegalStateException::class.java) {
                provider.translatedTexts("deepl", 200, body, expectedCount)
            }
            assertEquals("Translation provider returned an incomplete response", failure.message)
        }
    }

    @Test
    fun missingOrBlankTranslatedTextIsRejectedForBothProviders() {
        for (entry in listOf("{}", """{"text":" ","translatedText":" "}""")) {
            val googleBody = """{"data":{"translations":[$entry]}}"""
            val deeplBody = """{"translations":[$entry]}"""
            for ((name, body) in listOf("google" to googleBody, "deepl" to deeplBody)) {
                val failure = assertThrows(IllegalStateException::class.java) {
                    provider.translatedTexts(name, 200, body, 1)
                }
                assertEquals("Translation provider returned no text", failure.message)
            }
        }
    }

    @Test
    fun emptyBatchesRemainValid() {
        assertEquals(emptyList<String>(), provider.translatedTexts("google", 200, """{"data":{"translations":[]}}""", 0))
        assertEquals(emptyList<String>(), provider.translatedTexts("deepl", 200, """{"translations":[]}""", 0))
    }

    /** Reads the actual UTF-8 body publisher with a bounded wait, without opening a connection. */
    private fun requestBody(request: HttpRequest): JsonNode {
        val subscriber = HttpResponse.BodySubscribers.ofString(StandardCharsets.UTF_8)
        request.bodyPublisher().orElseThrow().subscribe(object : Flow.Subscriber<ByteBuffer> {
            override fun onSubscribe(subscription: Flow.Subscription) = subscriber.onSubscribe(subscription)

            override fun onNext(buffer: ByteBuffer) = subscriber.onNext(listOf(buffer))

            override fun onError(error: Throwable) = subscriber.onError(error)

            override fun onComplete() = subscriber.onComplete()
        })
        return mapper.readTree(subscriber.body.toCompletableFuture().get(5, TimeUnit.SECONDS))
    }
}

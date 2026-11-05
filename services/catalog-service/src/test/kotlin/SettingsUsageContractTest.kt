import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.api.SettingsViolation
import com.constitutionatlas.catalog.client.SettingsUsageClient
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.web.server.ResponseStatusException
import java.net.InetSocketAddress
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

class SettingsUsageContractTest {
    private val version = UUID(0, 1)
    private val logical = UUID(0, 2)
    private val draft = UUID(0, 3)

    @Test
    fun `invalid kind prunes descendants before title and content validation`() {
        val json = """{"roots":[{"logicalId":"$logical","kind":"unknown","title":"Unexpected","content":[{"type":"child","node":{"logicalId":"invalid UUID","kind":"unknown"}}]}]}"""
        serve(json) { client, requests ->
            assertEquals(listOf(SettingsViolation(version, logical, "kind", "Stored 'unknown' is not allowed at the root")), client.inspect(listOf(version), outline(), null).violations)
            assertEquals(listOf("/versions/$version/content"), requests)
        }
    }

    @Test
    fun `title label and mixed parent content violations keep encounter order`() {
        val json = """{"roots":[{"logicalId":"$logical","kind":"article","label":"unexpected","content":[{"type":"text"},{"type":"child","node":{"kind":"clause","content":[]}}]}]}"""
        val kinds = listOf(OutlineKindWrite("article", "Article", root = true, titlePolicy = "required", labelPolicy = "none", allowedChildKinds = listOf("clause")), OutlineKindWrite("clause", "Clause", allowedChildKinds = emptyList()))
        serve(json) { client, _ ->
            assertEquals(listOf("title", "label", "content"), client.inspect(listOf(version), kinds, null).violations.map { it.field })
        }
    }

    @Test
    fun `each version reads content before authenticated drafts and draft identities deduplicate in order`() {
        val second = UUID(0, 4)
        val sessions = """[{"id":"$draft","status":"open"},{"id":"${UUID(0, 5)}","status":"published"},{"id":"$draft","status":"reviewing"}]"""
        serve("""{"roots":[]} """, sessions) { client, requests ->
            val usage = client.inspect(listOf(version, second), outline(), "Bearer editor")
            assertEquals(listOf(draft), usage.draftSessionIds)
            assertEquals(listOf("/versions/$version/content", "/edit-sessions", "/versions/$second/content", "/edit-sessions"), requests)
            assertTrue(usage.violations.isEmpty())
        }
    }

    @Test
    fun `transport failures retain public unavailable status and reason`() {
        serve("{}", contentStatus = 500) { client, _ ->
            val failure = assertThrows(ResponseStatusException::class.java) { client.inspect(listOf(version), outline(), "Bearer editor") }
            assertEquals(503, failure.statusCode.value())
            assertEquals("Impact analysis requires content and draft services", failure.reason)
        }
    }

    @Test
    fun `missing content body keeps its distinct failure before reading editor sessions`() {
        serve("", contentStatus = 204) { client, requests ->
            val failure = assertThrows(ResponseStatusException::class.java) { client.inspect(listOf(version), outline(), "Bearer editor") }
            assertEquals("Content impact unavailable", failure.reason)
            assertEquals(listOf("/versions/$version/content"), requests)
        }
    }

    @Test
    fun `malformed stored identities remain argument errors and do not become unavailable failures`() {
        serve("""{"roots":[{"logicalId":"not-a-uuid","kind":"article"}]}""") { client, _ ->
            assertThrows(IllegalArgumentException::class.java) { client.inspect(listOf(version), outline(), null) }
        }
    }

    /** Leaf article policy avoids introducing unrelated shape violations in transport contracts. */
    private fun outline() = listOf(OutlineKindWrite("article", "Article", root = true, allowedChildKinds = emptyList()))

    /** Real loopback HTTP preserves request order, credential forwarding and exception conversion. */
    private fun serve(content: String, sessions: String = "[]", contentStatus: Int = 200, inspect: (SettingsUsageClient, List<String>) -> Unit) {
        val requests = CopyOnWriteArrayList<String>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val path = exchange.requestURI.path
            requests += path
            val isContent = path.startsWith("/versions/")
            val body = (if (isContent) content else sessions).toByteArray()
            val status = if (isContent) contentStatus else 200
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(status, if (status == 204) -1 else body.size.toLong())
            exchange.responseBody.use { if (status != 204) it.write(body) }
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            inspect(SettingsUsageClient(url, url), requests)
        } finally {
            server.stop(0)
        }
    }
}

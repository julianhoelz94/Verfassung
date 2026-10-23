import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.client.SettingsUsageClient
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class SettingsUsageClientTest {
    @Test
    fun authenticatedImpactAnalysisCanInspectPrivateDraftContentAndSessions() {
        val version = UUID.randomUUID()
        val draft = UUID.randomUUID()
        val requests = mutableListOf<String>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val path = exchange.requestURI.path
            val authorized = exchange.requestHeaders.getFirst("Authorization") == "Bearer editorial-session"
            val body = when {
                !authorized -> """{"error":"Unknown version"}"""
                path == "/versions/$version/content" -> """{"roots":[{"kind":"article","content":[{"type":"text","text":"Unpublished draft"}]}]}"""
                else -> """[{"id":"$draft","status":"open"}]"""
            }.toByteArray(Charsets.UTF_8)
            synchronized(requests) { requests += path }
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(if (authorized) 200 else 404, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            val usage = SettingsUsageClient(url, url).inspect(
                listOf(version),
                listOf(OutlineKindWrite("article", "Article", root = true, allowedChildKinds = emptyList())),
                "Bearer editorial-session",
            )
            assertThat(usage.violations).isEmpty()
            assertThat(usage.draftSessionIds).containsExactly(draft)
            assertThat(requests).containsExactly("/versions/$version/content", "/edit-sessions")
        } finally {
            server.stop(0)
        }
    }
}

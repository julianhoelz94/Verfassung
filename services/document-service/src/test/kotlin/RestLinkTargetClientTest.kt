import com.constitutionatlas.document.service.RestLinkTargetClient
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class RestLinkTargetClientTest {
    @Test
    fun publishedEditorialSnapshotsKeepPublicDocumentLinksAfterAnotherCorrection() {
        val versionId = UUID.randomUUID()
        val currentId = UUID.randomUUID()
        withVersionResponse(200, """{"id":"$versionId","currentVersionId":"$currentId","publicationStatus":"published","listing":"staff"}""") { client ->
            assertThat(client.isPublic("version", versionId, null)).isTrue()
        }
    }

    @Test
    fun draftOrMissingVersionsDoNotExposeDocumentLinks() {
        val versionId = UUID.randomUUID()
        withVersionResponse(200, """{"publicationStatus":"draft","listing":"public"}""") { client ->
            assertThat(client.isPublic("version", versionId, null)).isFalse()
        }
        withVersionResponse(404, """{"error":"Unknown version"}""") { client ->
            assertThat(client.isPublic("version", versionId, null)).isFalse()
        }
    }

    private fun withVersionResponse(status: Int, body: String, verify: (RestLinkTargetClient) -> Unit) {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/versions/") { exchange ->
            val bytes = body.toByteArray(Charsets.UTF_8)
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            verify(RestLinkTargetClient(url, url))
        } finally {
            server.stop(0)
        }
    }
}

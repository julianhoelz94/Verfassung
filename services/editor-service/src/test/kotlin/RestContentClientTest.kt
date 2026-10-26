import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.client.RestContentClient
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class RestContentClientTest {
    @Test
    fun readsEveryArticlePageAndAuthorizesEachRequest() {
        for (includeTotal in listOf(true, false)) {
            val version = UUID.randomUUID()
            val requests = mutableListOf<Pair<String, String?>>()
            val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
            server.createContext("/versions/$version/articles") { exchange ->
                val query = exchange.requestURI.query
                requests += query to exchange.requestHeaders.getFirst("Authorization")
                val offset = query.substringAfter("offset=").substringBefore('&').toInt()
                val rows = (offset until minOf(offset + 200, 205)).joinToString(",") { index ->
                    """{"id":"${UUID(0, index.toLong() + 1)}","versionId":"$version","articleNumber":"${index + 1}","title":"Article ${index + 1}","sortOrder":${index + 1},"body":"Text ${index + 1}"}"""
                }
                val bytes = "[$rows]".toByteArray()
                exchange.responseHeaders.set("Content-Type", "application/json")
                if (includeTotal) exchange.responseHeaders.set("X-Total-Count", "205")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
            server.start()
            try {
                val articles = RestContentClient("http://127.0.0.1:${server.address.port}", "test-token").listArticles(version)
                assertThat(articles.map { it.articleNumber }).containsExactlyElementsOf((1..205).map(Int::toString))
                assertThat(articles.last().body).isEqualTo("Text 205")
                assertThat(requests).containsExactly(
                    "includeBody=true&offset=0&limit=200" to "Bearer test-token",
                    "includeBody=true&offset=200&limit=200" to "Bearer test-token",
                )
            } finally {
                server.stop(0)
            }
        }
    }

    @Test
    fun refusesAnIncompleteSourceInsteadOfPublishingItsPartialContents() {
        val version = UUID.randomUUID()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/versions/$version/articles") { exchange ->
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.responseHeaders.set("X-Total-Count", "1")
            exchange.sendResponseHeaders(200, 2)
            exchange.responseBody.use { it.write("[]".toByteArray()) }
        }
        server.start()
        try {
            assertThrows(DownstreamException::class.java) {
                RestContentClient("http://127.0.0.1:${server.address.port}").listArticles(version)
            }
        } finally {
            server.stop(0)
        }
    }
}

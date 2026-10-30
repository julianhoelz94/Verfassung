import com.constitutionatlas.editor.client.RestSearchIndexClient
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger

class RestSearchIndexClientTest {
    @Test
    fun slowRebuildCompletesWithoutPrematureFailureOrDuplicateRequests() {
        val requests = AtomicInteger()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/reindex") { exchange ->
            requests.incrementAndGet()
            assertThat(exchange.requestMethod).isEqualTo("POST")
            assertThat(exchange.requestHeaders.getFirst("Authorization")).isEqualTo("Bearer test-token")
            // A larger corpus can exceed the ordinary five-second read timeout.
            Thread.sleep(6000)
            exchange.sendResponseHeaders(204, -1)
            exchange.close()
        }
        server.start()
        try {
            RestSearchIndexClient("http://127.0.0.1:${server.address.port}", "test-token").reindex()
            assertThat(requests.get()).isEqualTo(1)
        } finally {
            server.stop(0)
        }
    }
}

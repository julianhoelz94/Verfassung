import com.constitutionatlas.editor.client.OrderedPublishClient
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class OrderedPublishClientTest {
    @Test
    fun reservationUsesServiceCredentialInsteadOfPublisherCredential() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val headers = mutableListOf<String?>()
        server.createContext("/publish-attempts") { exchange ->
            headers.add(exchange.requestHeaders.getFirst("Authorization"))
            exchange.sendResponseHeaders(404, -1)
            exchange.close()
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            assertThat(OrderedPublishClient(url, url, "service-token").reservation(UUID.randomUUID(), "Bearer publisher-token")).isNull()
            assertThat(OrderedPublishClient(url, url, "Bearer service-token").reservation(UUID.randomUUID(), "Bearer publisher-token")).isNull()
            assertThat(OrderedPublishClient(url, url).reservation(UUID.randomUUID(), "Bearer publisher-token")).isNull()
            assertThat(headers).containsExactly("Bearer service-token", "Bearer service-token", "Bearer publisher-token")
        } finally {
            server.stop(0)
        }
    }
}

import com.constitutionatlas.editor.client.OrderedPublishClient
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class OrderedPublishClientTest {
    @Test
    fun sourceCorrectionReservationTransmitsTheReviewedEvidence() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val constitution = UUID.randomUUID()
        val version = UUID.randomUUID()
        val target = UUID.randomUUID()
        val evidence = com.constitutionatlas.platform.SourceEvidence(description = "# Official archive\n\n[Source](https://example.test/source)")
        var request = ""
        server.createContext("/constitutions/$constitution/versions") { exchange ->
            request = exchange.requestBody.bufferedReader().readText()
            val body = """{"id":"$target","constitutionId":"$constitution","versionLabel":"correction","publicationStatus":"draft"}""".toByteArray()
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            val source = com.constitutionatlas.editor.client.CatalogVersion(version, constitution, "2025", "published", sourceEvidence = evidence)
            val reserved = OrderedPublishClient(url, url).reserve(UUID.randomUUID(), source, "editorial_correction", "Clarify excerpt", UUID.randomUUID(), "Bearer publisher")
            assertThat(reserved.id).isEqualTo(target)
            val payload = tools.jackson.databind.json.JsonMapper().readTree(request)
            assertThat(payload.path("sourceEvidence").path("description").asText()).isEqualTo(evidence.description)
            assertThat(payload.path("predecessorVersionId").asText()).isEqualTo(version.toString())
        } finally {
            server.stop(0)
        }
    }

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

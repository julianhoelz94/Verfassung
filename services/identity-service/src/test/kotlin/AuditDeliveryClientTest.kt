import com.constitutionatlas.identity.client.RestAuditDeliveryClient
import com.constitutionatlas.identity.repo.PendingAudit
import tools.jackson.databind.json.JsonMapper
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.web.client.RestClientException
import java.net.InetSocketAddress
import java.time.OffsetDateTime
import java.util.UUID

class AuditDeliveryClientTest {
    @Test
    fun httpRetriesSendTheOriginalEventIdentityAndTime() {
        val mapper = JsonMapper()
        val received = mutableListOf<String>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/events") { exchange ->
            check(exchange.requestHeaders.getFirst("Authorization") == "Bearer test-delivery-token")
            received += exchange.requestBody.bufferedReader().readText()
            exchange.sendResponseHeaders(if (received.size == 1) 503 else 204, -1)
            exchange.close()
        }
        server.start()
        try {
            val event = PendingAudit(UUID.randomUUID(), OffsetDateTime.parse("2026-10-25T10:15:30Z"), mapper.readTree("""{"action":"roles_changed","entityType":"user","entityId":"${UUID.randomUUID()}"}"""))
            val url = "http://127.0.0.1:${server.address.port}"
            assertThrows(RestClientException::class.java) { RestAuditDeliveryClient(url, "test-delivery-token").deliver(event) }
            RestAuditDeliveryClient(url, "test-delivery-token").deliver(event)
            check(received.size == 2 && received[0] == received[1])
            val body = mapper.readTree(received[0])
            check(body.path("eventId").asText() == event.eventId.toString())
            check(OffsetDateTime.parse(body.path("occurredAt").asText()) == event.occurredAt)
        } finally {
            server.stop(0)
        }
    }
}

import com.constitutionatlas.ingestion.repo.ImportPublicationOutbox
import com.constitutionatlas.ingestion.repo.PublicationEvent
import com.constitutionatlas.ingestion.service.ImportPublicationDelivery
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.net.InetSocketAddress
import java.time.OffsetDateTime
import java.util.UUID

class ImportAuditDeliveryTest {
    @Test
    fun retryAfterLostAcknowledgementKeepsTheEventIdentityAndOriginalTimestamp() {
        val mapper = jacksonObjectMapper()
        val outbox = Mockito.mock(ImportPublicationOutbox::class.java)
        val event = PublicationEvent(UUID.randomUUID(), "audit_publish", """{"action":"published","entityType":"version","entityId":"${UUID.randomUUID()}"}""", 0, OffsetDateTime.parse("2026-10-20T10:00:00Z"))
        Mockito.`when`(outbox.pending()).thenReturn(listOf(event))
        val received = mutableListOf<com.fasterxml.jackson.databind.JsonNode>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/events") { exchange ->
            received.add(mapper.readTree(exchange.requestBody))
            // Audit may have persisted the event before a proxy loses the acknowledgement.
            exchange.sendResponseHeaders(if (received.size == 1) 502 else 201, -1)
            exchange.close()
        }
        server.start()
        try {
            val delivery = ImportPublicationDelivery(outbox, mapper, "http://127.0.0.1:${server.address.port}", "http://unused.invalid", "audit-token", "")
            delivery.deliverPending()
            Mockito.verify(outbox).retry(event.id, 0)
            Mockito.verify(outbox, Mockito.never()).delivered(event.id)
            delivery.deliverPending()
            assertEquals(2, received.size)
            assertEquals(received.first(), received.last())
            assertEquals(event.id.toString(), received.first().path("eventId").asText())
            assertEquals(event.createdAt.toString(), received.first().path("occurredAt").asText())
            Mockito.verify(outbox).delivered(event.id)
        } finally {
            server.stop(0)
        }
    }
}

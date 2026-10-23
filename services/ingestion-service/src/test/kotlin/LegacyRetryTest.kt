import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.client.RestContentClient
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.OrderedNode
import com.constitutionatlas.platform.OrderedSnapshot
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class LegacyRetryTest {
    @Test
    fun retryReadsThePersistedLegacyDraftWithoutReplacingIdentitiesOrOverwritingAReconciliation() {
        val version = UUID.randomUUID()
        val root = OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "article", "1", "Title", listOf(OrderedEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), occurrenceId = UUID.randomUUID(), text = "Exact wording")))
        val snapshot = OrderedSnapshot(version, 1, null, listOf(root))
        var writes = 0
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            if (exchange.requestMethod != "GET") writes++
            val bytes = jacksonObjectMapper().writeValueAsBytes(snapshot)
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val client = RestContentClient("http://127.0.0.1:${server.address.port}")
            val input = listOf(ImportArticle("1", "Title", "Exact wording", 1))
            client.replaceArticles(version, input)
            client.replaceArticles(version, input)
            assertEquals(snapshot, client.snapshot(version))
            assertThrows(IllegalStateException::class.java) { client.replaceArticles(version, listOf(input.single().copy(body = "Different wording"))) }
            assertEquals(0, writes)
        } finally {
            server.stop(0)
        }
    }
}

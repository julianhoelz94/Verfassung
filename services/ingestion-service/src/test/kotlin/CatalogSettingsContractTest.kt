import com.constitutionatlas.ingestion.client.RestCatalogClient
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class CatalogSettingsContractTest {
    @Test
    fun catalogDerivedReadMetadataDoesNotEnterTheStrictImportWriteContract() {
        val revision = UUID.randomUUID()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val bytes = """{"id":"$revision","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article","root":true,"allowedChildKinds":[],"mayHoldText":true,"mayHoldChildren":false,"sortOrder":1}]}}""".toByteArray()
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val client = RestCatalogClient("http://127.0.0.1:${server.address.port}")
            assertEquals(revision, client.currentSettingsRevisionId(UUID.randomUUID()))
            val kind = client.settingsOutline(UUID.randomUUID(), revision).kinds.single()
            assertEquals(true, kind.root)
            assertEquals(emptyList<String>(), kind.allowedChildKinds)
            assertEquals("article", kind.kindCode)
        } finally {
            server.stop(0)
        }
    }
}

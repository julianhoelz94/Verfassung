import com.constitutionatlas.editor.client.RestCatalogClient
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class RestCatalogClientTest {
    @Test
    fun listVersionsReadsCatalogSummaryWithoutDetailOnlyFields() {
        val constitutionId = UUID.randomUUID()
        val versionId = UUID.randomUUID()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/constitutions/$constitutionId/versions") { exchange ->
            assertThat(exchange.requestURI.query).isEqualTo("listing=all")
            assertThat(exchange.requestHeaders.getFirst("Authorization")).isEqualTo("Bearer test-token")
            val body = """[{"id":"$versionId","versionLabel":"2026","effectiveDate":"2026-01-01","languageCode":"en","sourceUrl":null,"gazetteReference":null,"provenance":"imported","verificationState":"unverified","verifiedBy":null,"verifiedAt":null,"hopKind":"legal","listing":"public","latestPublished":true,"legalVersionId":"$versionId","currentVersionId":"$versionId"}]"""
            val bytes = body.toByteArray()
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val versions = RestCatalogClient("http://127.0.0.1:${server.address.port}", "test-token")
                .listVersions(constitutionId, "all")
            assertThat(versions).hasSize(1)
            assertThat(versions.single().id).isEqualTo(versionId)
            assertThat(versions.single().constitutionId).isEqualTo(constitutionId)
            assertThat(versions.single().publicationStatus).isEqualTo("published")
            assertThat(versions.single().hopKind).isEqualTo("legal")
            assertThat(versions.single().currentVersionId).isEqualTo(versionId)
        } finally {
            server.stop(0)
        }
    }
}

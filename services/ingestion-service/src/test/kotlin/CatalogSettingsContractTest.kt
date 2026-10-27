import com.constitutionatlas.ingestion.client.RestCatalogClient
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class CatalogSettingsContractTest {
    @Test
    fun onlyTheExplicitNoWriteCodeMakesARejectedSetupEditable() {
        val code = java.util.concurrent.atomic.AtomicReference("constitution_creation_rejected")
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            exchange.requestBody.readBytes()
            val bytes = """{"code":"${code.get()}"}""".toByteArray()
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(409, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val request = com.constitutionatlas.ingestion.api.SetupProposalRequest(
                isoCode = "FR",
                constitutionSlug = "reviewed",
                constitutionTitle = "Reviewed charter",
                outline = com.constitutionatlas.ingestion.api.ImportOutline(emptyList()),
            )
            val client = RestCatalogClient("http://127.0.0.1:${server.address.port}")
            org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.ingestion.client.SetupCreationRejectedException::class.java) {
                client.createSetupConstitution(UUID.randomUUID(), request)
            }
            code.set("creation_attempt_mismatch")
            org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.client.HttpClientErrorException::class.java) {
                client.createSetupConstitution(UUID.randomUUID(), request)
            }
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun setupCreationSendsTheStableOperationAndReviewedOutlineInOneRequest() {
        val operation = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val settings = UUID.randomUUID()
        val jurisdiction = UUID.randomUUID()
        val requests = mutableListOf<Pair<String, tools.jackson.databind.JsonNode>>()
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            requests += exchange.requestURI.path to mapper.readTree(exchange.requestBody)
            assertEquals("Bearer reviewed-editor", exchange.requestHeaders.getFirst("Authorization"))
            val bytes = """{"id":"$constitution","settingsRevisionId":"$settings","title":"extra read metadata"}""".toByteArray()
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(201, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val request = com.constitutionatlas.ingestion.api.SetupProposalRequest(
                isoCode = "fr",
                constitutionSlug = "reviewed",
                constitutionTitle = "Reviewed charter",
                outline = com.constitutionatlas.ingestion.api.ImportOutline(listOf(com.constitutionatlas.ingestion.api.ImportOutlineKind("article", "Reviewed article", root = true))),
            )
            val client = RestCatalogClient("http://127.0.0.1:${server.address.port}")
            com.constitutionatlas.ingestion.client.DownstreamAuth.withAuthorization("Bearer reviewed-editor") {
                val result = client.createSetupConstitution(operation, request)
                assertEquals(constitution, result.id)
                assertEquals(settings, result.settingsRevisionId)
                client.createSetupConstitution(operation, request.copy(isoCode = "", jurisdictionId = jurisdiction))
            }
            assertEquals(listOf("/countries/FR/constitutions", "/jurisdictions/$jurisdiction/constitutions"), requests.map { it.first })
            requests.forEach { (_, body) ->
                assertEquals(operation.toString(), body.path("creationAttemptId").asText())
                assertEquals("Reviewed article", body.path("outline").first().path("displayLabel").asText())
                assertEquals(true, body.path("outline").first().path("root").asBoolean())
            }
        } finally {
            server.stop(0)
        }
    }

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

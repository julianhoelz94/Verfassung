import com.constitutionatlas.ingestion.api.ImportErrorDto
import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.ingestion.client.MigrationDomainClient
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.ingestion.service.ImportExportService
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNode
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedSnapshot
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.node.ObjectNode
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID

class ImportExportContractTest {
    @Test
    fun `ownership and scope checks precede invalid view and payload access`() {
        val f = Fixture()
        val outsider = f.owner.copy(id = UUID.randomUUID(), scopes = emptyList())
        assertEquals("Import job access requires ownership or staff role", assertThrows(ForbiddenException::class.java) { f.exports.export(f.id, outsider, "invalid", null) }.message)
        assertEquals("Import read-back requires an import scope or staff role", assertThrows(ForbiddenException::class.java) { f.exports.export(f.id, f.owner.copy(scopes = emptyList()), "invalid", null) }.message)
        verifyNoInteractions(f.content, f.catalog, f.domains)
        assertFailure(400, "view must be submitted or prepared") { f.exports.export(f.id, f.owner, "invalid", null) }
        assertTrue(f.exports.export(f.id, outsider.copy(roles = listOf("reviewer")), "submitted", null).complete)
    }

    @Test
    fun `missing job and missing payload preserve distinct not found errors`() {
        val f = Fixture()
        assertEquals("Unknown import job", assertThrows(NotFoundException::class.java) { f.exports.export(UUID.randomUUID(), f.owner, "prepared", null) }.message)
        `when`(f.jobs.request(f.id)).thenReturn(null)
        assertEquals("Import payload missing", assertThrows(NotFoundException::class.java) { f.exports.export(f.id, f.owner, "prepared", null) }.message)
        verifyNoInteractions(f.content, f.catalog, f.domains)
    }

    @Test
    fun `prepared snapshot and service credential requirements do not affect submitted view`() {
        val f = Fixture(token = "")
        `when`(f.jobs.find(f.id)).thenReturn(f.job.copy(versionId = null))
        assertFailure(409, "Import has no prepared persisted snapshot; use submitted view") { f.exports.export(f.id, f.owner, "prepared", null) }
        `when`(f.jobs.find(f.id)).thenReturn(f.job)
        assertFailure(503, "Import read-back service credential is not configured") { f.exports.export(f.id, f.owner, "prepared", null) }
        val submitted = f.exports.export(f.id, f.owner, "submitted", null)
        assertNull(submitted.generation)
        assertFalse(submitted.resourcesComplete)
        assertFalse(submitted.fidelityComplete)
        assertEquals(f.job.errors, submitted.validationErrors)
        verifyNoInteractions(f.content, f.catalog, f.domains)
    }

    @Test
    fun `content and catalog use service credentials while links use the explicit caller credential`() {
        val f = Fixture(withDomains = true)
        doAnswer {
            assertEquals("Bearer internal-read", DownstreamAuth.header())
            f.snapshot
        }.`when`(f.content).snapshot(f.version)
        doAnswer {
            assertEquals("Bearer internal-read", DownstreamAuth.header())
            f.persistedVersion
        }.`when`(f.catalog).version(f.version)
        doAnswer {
            assertEquals("Bearer surrounding", DownstreamAuth.header())
            f.mapper.createArrayNode()
        }.`when`(f.domains).importLinks(f.id, f.version, "Bearer caller")
        DownstreamAuth.withAuthorization("Bearer surrounding") {
            assertTrue(f.exports.export(f.id, f.owner, "prepared", null, "Bearer caller").resourcesComplete)
            assertEquals("Bearer surrounding", DownstreamAuth.header())
        }
        assertNull(DownstreamAuth.header())
    }

    @Test
    fun `failed downstream snapshot restores any surrounding authorization`() {
        val f = Fixture()
        `when`(f.content.snapshot(f.version)).thenThrow(IllegalStateException("snapshot unavailable"))
        DownstreamAuth.withAuthorization("Bearer surrounding") {
            assertEquals("snapshot unavailable", assertThrows(IllegalStateException::class.java) { f.exports.export(f.id, f.owner, "prepared", null) }.message)
            assertEquals("Bearer surrounding", DownstreamAuth.header())
        }
        assertNull(DownstreamAuth.header())
        verifyNoInteractions(f.catalog, f.domains)
    }

    @Test
    fun `snapshot identifier hashes the exact prepared tree with pins and linked documents`() {
        val f = Fixture(withDomains = true)
        val links = f.mapper.readTree("[{\"documentId\":\"linked\"}]")
        `when`(f.domains.importLinks(f.id, f.version, null)).thenReturn(links)
        val tree = f.mapper.valueToTree<ObjectNode>(f.snapshot)
        tree.set("sourcePins", f.mapper.valueToTree<JsonNode>(f.persistedVersion))
        tree.set("linkedDocuments", links)
        val expected = MessageDigest.getInstance("SHA-256").digest(f.mapper.writeValueAsBytes(tree)).joinToString("") { "%02x".format(it) }
        val page = f.exports.export(f.id, f.owner, "prepared", null)
        assertEquals(expected, page.snapshotId)
        assertEquals("linked", page.records.single { it.path == "/linkedDocuments/0/documentId" }.value.textValue())
        assertEquals(f.request.sourceUrl, page.source["sourceUrl"])
        assertEquals(f.version, page.versionId)
        assertEquals(f.snapshot.generation, page.generation)
        assertEquals(f.snapshot.settingsRevisionId, page.settingsRevisionId)
        assertEquals(1, page.counts["documents"])
    }

    @Test
    fun `cursor errors retain binding hash and offset validation order`() {
        val f = Fixture()
        val page = f.exports.export(f.id, f.owner, "submitted", null)
        assertFailure(400, "Invalid export cursor") { f.exports.export(f.id, f.owner, "submitted", "!") }
        assertFailure(400, "Cursor belongs to another export") { f.exports.export(f.id, f.owner, "submitted", cursor("${f.id}:prepared:${page.snapshotId}:0")) }
        assertFailure(400, "Cursor belongs to another export") { f.exports.export(f.id, f.owner, "submitted", cursor("invalid")) }
        assertFailure(409, "Persisted snapshot changed; restart export") { f.exports.export(f.id, f.owner, "submitted", cursor("${f.id}:submitted:old:not-an-offset")) }
        assertFailure(400, "Invalid export offset") { f.exports.export(f.id, f.owner, "submitted", cursor("${f.id}:submitted:${page.snapshotId}:not-an-offset")) }
        assertFailure(400, "Invalid export offset") { f.exports.export(f.id, f.owner, "submitted", cursor("${f.id}:submitted:${page.snapshotId}:-1")) }
        assertFailure(400, "Invalid export offset") { f.exports.export(f.id, f.owner, "submitted", cursor("${f.id}:submitted:${page.snapshotId}:${page.totalRecords + 1}")) }
        val end = f.exports.export(f.id, f.owner, "submitted", cursor("${f.id}:submitted:${page.snapshotId}:${page.totalRecords}"))
        assertTrue(end.records.isEmpty())
        assertTrue(end.complete)
        assertNull(end.nextCursor)
    }

    @Test
    fun `record count pagination advances at two hundred records without changing snapshot identity`() {
        val f = Fixture()
        `when`(f.jobs.request(f.id)).thenReturn(f.request.copy(expectedCounts = (0..220).associate { "count$it" to it }))
        val first = f.exports.export(f.id, f.owner, "submitted", null)
        assertEquals(200, first.records.size)
        assertFalse(first.complete)
        assertEquals("${f.id}:submitted:${first.snapshotId}:200", String(Base64.getUrlDecoder().decode(first.nextCursor)))
        val second = f.exports.export(f.id, f.owner, "submitted", first.nextCursor)
        assertEquals(first.snapshotId, second.snapshotId)
        assertEquals(first.totalRecords, first.records.size + second.records.size)
        assertEquals(first.totalRecords, (first.records + second.records).map { it.path }.toSet().size)
        assertTrue(second.complete)
        assertNull(second.nextCursor)
    }

    @Test
    fun `submitted counts cannot claim complete document resources even when zero was requested`() {
        val f = Fixture()
        `when`(f.jobs.request(f.id)).thenReturn(f.request.copy(expectedCounts = linkedMapOf("units" to 1, "documents" to 0, "unknown" to 0)))
        val page = f.exports.export(f.id, f.owner, "submitted", null)
        assertEquals(listOf("/counts/documents", "/counts/unknown"), page.fidelity.map { it.path })
        assertEquals(listOf("Expected 0; persisted 0", "Expected 0; persisted 0"), page.fidelity.map { it.reason })
        assertFalse(page.resourcesComplete)
        assertFalse(page.fidelityComplete)
    }

    @Test
    fun `only an array of linked resources makes a prepared fidelity report complete`() {
        val f = Fixture(withDomains = true)
        `when`(f.jobs.request(f.id)).thenReturn(f.request.copy(expectedCounts = mapOf("documents" to 0)))
        val complete = f.exports.export(f.id, f.owner, "prepared", null)
        assertTrue(complete.resourcesComplete)
        assertTrue(complete.fidelityComplete)
        assertTrue(complete.fidelity.isEmpty())
        `when`(f.domains.importLinks(f.id, f.version, null)).thenReturn(f.mapper.createObjectNode().put("opaque", "value"))
        val incomplete = f.exports.export(f.id, f.owner, "prepared", null)
        assertFalse(incomplete.resourcesComplete)
        assertFalse(incomplete.fidelityComplete)
        assertEquals("/counts/documents", incomplete.fidelity.single().path)
        assertEquals(1, incomplete.counts["documents"])
    }

    @Test
    fun `fidelity reports truncate at one hundred mismatches while preserving the completeness boundary`() {
        val f = Fixture(withDomains = true)
        val entries = List(101) { OrderedEntryWrite("text", text = "submitted") }
        `when`(f.jobs.request(f.id)).thenReturn(f.request.copy(roots = listOf(f.request.roots.single().copy(content = entries))))
        val persisted = f.snapshot.copy(roots = listOf(f.snapshot.roots.single().copy(content = List(101) { OrderedEntry("text", text = "persisted") })))
        `when`(f.content.snapshot(f.version)).thenReturn(persisted)
        val truncated = f.exports.export(f.id, f.owner, "prepared", null)
        assertEquals(100, truncated.fidelity.size)
        assertEquals("/roots/0/content/0/text", truncated.fidelity.first().path)
        assertEquals("/roots/0/content/99/text", truncated.fidelity.last().path)
        assertFalse(truncated.fidelityComplete)
        `when`(f.jobs.request(f.id)).thenReturn(f.request.copy(roots = listOf(f.request.roots.single().copy(content = entries.take(100)))))
        `when`(f.content.snapshot(f.version)).thenReturn(persisted.copy(roots = listOf(persisted.roots.single().copy(content = persisted.roots.single().content.take(100)))))
        val boundary = f.exports.export(f.id, f.owner, "prepared", null)
        assertEquals(100, boundary.fidelity.size)
        assertTrue(boundary.fidelityComplete)
    }

    @Test
    fun `long Unicode text chunks never split a surrogate pair and record paths escape pointers`() {
        val f = Fixture()
        val text = "x".repeat(15_999) + "😀" + "y".repeat(3)
        `when`(f.jobs.request(f.id)).thenReturn(f.request.copy(constitutionTitle = text, expectedCounts = mapOf("a~/b" to 1)))
        val page = f.exports.export(f.id, f.owner, "submitted", null)
        val chunks = page.records.filter { it.path.startsWith("/constitutionTitle/@text/") }
        assertEquals(listOf("/constitutionTitle/@text/0", "/constitutionTitle/@text/1"), chunks.map { it.path })
        assertEquals(15_999, chunks.first().value.textValue().length)
        assertEquals("😀yyy", chunks.last().value.textValue())
        assertEquals(text, chunks.joinToString("") { it.value.textValue() })
        assertEquals(1, page.records.single { it.path == "/expectedCounts/a~0~1b" }.value.intValue())
    }

    @Test
    fun `missing prepared catalog version is checked after cursor binding`() {
        val f = Fixture()
        `when`(f.catalog.version(f.version)).thenReturn(null)
        assertFailure(400, "Invalid export cursor") { f.exports.export(f.id, f.owner, "prepared", "!") }
        assertFailure(409, "Prepared catalog version is unavailable") { f.exports.export(f.id, f.owner, "prepared", null) }
    }

    /** Verifies public status and reason without coupling to helper decomposition. */
    private fun assertFailure(status: Int, reason: String, action: () -> Unit) {
        val failure = assertThrows(ResponseStatusException::class.java, action)
        assertEquals(status, failure.statusCode.value())
        assertEquals(reason, failure.reason)
    }

    /** Produces the public URL-safe opaque cursor format for binding and offset contract cases. */
    private fun cursor(value: String): String = Base64.getUrlEncoder().withoutPadding().encodeToString(value.toByteArray())

    /** Stable staged and persisted versions let tests inspect real exported records and hashes. */
    private class Fixture(token: String = "internal-read", withDomains: Boolean = false) {
        val jobs = mock(ImportJobRepository::class.java)
        val content = mock(ContentClient::class.java)
        val catalog = mock(CatalogClient::class.java)
        val domains = mock(MigrationDomainClient::class.java)
        val mapper = jacksonObjectMapper()
        val owner = Actor(UUID(0, 1), "importer@example.local", emptyList(), listOf("ingestion:import"))
        val id = UUID(0, 2)
        val version = UUID(0, 3)
        private val constitution = UUID(0, 4)
        private val settings = UUID(0, 5)
        private val logical = UUID(0, 6)
        val request = ImportRequest("DE", "Germany", "archive", "Constitution", "1849", sourceUrl = "https://example.org/source", constitutionId = constitution, settingsRevisionId = settings, roots = listOf(OrderedNodeWrite(logicalId = logical, kind = "article", content = listOf(OrderedEntryWrite("text", text = "Original")))))
        val job = ImportJobDto(id, "pending_review", version, listOf(ImportErrorDto("STAGED", "Existing feedback")), submittedBy = owner.id)
        val snapshot = OrderedSnapshot(version, 7, settings, listOf(OrderedNode(logical, UUID(0, 7), UUID(0, 8), "article", null, null, listOf(OrderedEntry("text", text = "Original")))))
        val persistedVersion = DownstreamVersion(version, constitution, versionLabel = "1849", sourceUrl = request.sourceUrl, languageCode = "en")
        val exports = ImportExportService(jobs, content, catalog, mapper, token, if (withDomains) domains else null)

        init {
            `when`(jobs.find(id)).thenReturn(job)
            `when`(jobs.request(id)).thenReturn(request)
            `when`(content.snapshot(version)).thenReturn(snapshot)
            `when`(catalog.version(version)).thenReturn(persistedVersion)
            `when`(domains.importLinks(id, version, null)).thenReturn(mapper.createArrayNode())
        }
    }
}

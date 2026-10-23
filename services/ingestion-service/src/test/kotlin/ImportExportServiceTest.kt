import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.ingestion.service.ImportExportService
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNode
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedSnapshot
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

class ImportExportServiceTest {
    private val jobs = mock(ImportJobRepository::class.java)
    private val content = mock(ContentClient::class.java)
    private val catalog = mock(CatalogClient::class.java)
    private val mapper = jacksonObjectMapper().findAndRegisterModules()
    private val exports = ImportExportService(jobs, content, catalog, mapper, "internal-read-credential")
    private val owner = Actor(UUID.randomUUID(), "importer@example.local", emptyList(), listOf("ingestion:import"))
    private val id = UUID.randomUUID()
    private val version = UUID.randomUUID()
    private val constitution = UUID.randomUUID()
    private val settings = UUID.randomUUID()
    private val logical = UUID.randomUUID()

    private fun setup(text: String = "Original wording", persisted: String = text, generation: Long = 1) {
        `when`(jobs.find(id)).thenReturn(ImportJobDto(id, "pending_review", version, emptyList(), submittedBy = owner.id))
        `when`(jobs.request(id)).thenReturn(
            ImportRequest(
                "DE", "Germany", "archive", "Constitution", "1849", sourceUrl = "https://example.org/original",
                constitutionId = constitution, settingsRevisionId = settings,
                roots = listOf(OrderedNodeWrite(logicalId = logical, kind = "article", label = "I", content = listOf(OrderedEntryWrite("text", text = text)))),
            ),
        )
        val snapshot = OrderedSnapshot(version, generation, settings, listOf(OrderedNode(logical, UUID.randomUUID(), UUID.randomUUID(), "article", "I", null, listOf(OrderedEntry("text", text = persisted)))))
        doAnswer {
            assertEquals("Bearer internal-read-credential", DownstreamAuth.header())
            snapshot
        }.`when`(content).snapshot(version)
        `when`(catalog.version(version)).thenReturn(DownstreamVersion(version, constitution, versionLabel = "1849", sourceUrl = "https://example.org/original"))
    }

    @Test
    fun `ownership is checked before any private downstream access`() {
        setup()
        clearInvocations(content, catalog)
        assertThrows(ForbiddenException::class.java) { exports.export(id, owner.copy(id = UUID.randomUUID()), "prepared", null) }
        verifyNoInteractions(content, catalog)
        assertNull(DownstreamAuth.header())
    }

    @Test
    fun `prepared export detects wording and source pin mismatches`() {
        setup(persisted = "Original wordinG")
        val page = exports.export(id, owner, "prepared", null)
        assertTrue(page.fidelity.any { it.path == "/roots/0/content/0/text" })
        `when`(catalog.version(version)).thenReturn(DownstreamVersion(version, constitution, sourceUrl = "https://example.org/wrong"))
        assertTrue(exports.export(id, owner, "prepared", null).fidelity.any { it.path == "/source" })
        assertNull(DownstreamAuth.header())
    }

    @Test
    fun `all long text is returned with explicit completeness and generation pin`() {
        setup(text = "ä".repeat(500_000))
        var page = exports.export(id, owner, "prepared", null)
        assertFalse(page.complete)
        assertTrue(page.fidelity.isEmpty())
        val firstCursor = page.nextCursor!!
        val chunks = mutableMapOf<Int, String>()
        var count = 0
        while (true) {
            page.records.filter { it.path.startsWith("/roots/0/content/0/text/@text/") }.forEach {
                chunks[it.path.substringAfterLast('/').toInt()] = it.value.asText()
            }
            count += page.records.size
            if (page.complete) break
            page = exports.export(id, owner, "prepared", page.nextCursor)
        }
        assertEquals(page.totalRecords, count)
        assertEquals("ä".repeat(500_000), chunks.toSortedMap().values.joinToString(""))
        assertThrows(ResponseStatusException::class.java) { exports.export(id, owner, "submitted", firstCursor) }
        setup(text = "ä".repeat(500_000), generation = 2)
        assertEquals(409, assertThrows(ResponseStatusException::class.java) { exports.export(id, owner, "prepared", firstCursor) }.statusCode.value())
    }

    @Test
    fun `submitted export never claims to be a persisted snapshot`() {
        setup()
        val page = exports.export(id, owner, "submitted", null)
        assertNull(page.generation)
        assertEquals("submitted", page.view)
    }
}

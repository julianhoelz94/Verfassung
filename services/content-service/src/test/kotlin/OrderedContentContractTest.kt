import com.constitutionatlas.content.CatalogUnavailableException
import com.constitutionatlas.content.VersionPublishedException
import com.constitutionatlas.content.api.OrderedEntry
import com.constitutionatlas.content.api.OrderedNode
import com.constitutionatlas.content.api.OrderedSnapshot
import com.constitutionatlas.content.api.OrderedSnapshotWrite
import com.constitutionatlas.content.client.CatalogClient
import com.constitutionatlas.content.client.CatalogVersion
import com.constitutionatlas.content.client.StructuralLevel
import com.constitutionatlas.content.client.StructuralOutline
import com.constitutionatlas.content.client.StructuralSettings
import com.constitutionatlas.content.repo.OrderedContentRepository
import com.constitutionatlas.content.repo.OrderedPublishReceipt
import com.constitutionatlas.content.repo.OrderedPublishReceiptRepository
import com.constitutionatlas.content.service.OrderedContentService
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.OrderedAnnotation
import com.constitutionatlas.platform.OrderedTable
import com.constitutionatlas.platform.OrderedTableCell
import com.constitutionatlas.platform.OrderedTableRow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

class OrderedContentContractTest {
    private val receipts = mock(OrderedPublishReceiptRepository::class.java)
    private val repository = mock(OrderedContentRepository::class.java)
    private val catalog = mock(CatalogClient::class.java)
    private val content = OrderedContentService(receipts, repository, catalog, true)
    private val version = UUID(0, 1)
    private val constitution = UUID(0, 2)
    private val settings = StructuralSettings(UUID(0, 3), StructuralOutline(listOf(level("article"))))

    @Test
    fun `receipt payload mismatch precedes any catalog or repository access`() {
        val attempt = UUID(0, 4)
        `when`(receipts.find(attempt)).thenReturn(OrderedPublishReceipt(version, "different", 0))
        val failure = assertThrows(ResponseStatusException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = emptyList(), publishAttemptId = attempt)) }
        assertEquals("Publish attempt payload changed", failure.reason)
        verifyNoInteractions(catalog, repository)
    }

    @Test
    fun `matching receipt returns the pinned snapshot without consulting publication state`() {
        val attempt = UUID(0, 4)
        val request = OrderedSnapshotWrite(3, roots = emptyList(), publishAttemptId = attempt)
        `when`(receipts.find(attempt)).thenReturn(OrderedPublishReceipt(version, com.constitutionatlas.platform.OrderedWriteFingerprint.current(request), 3))
        val saved = OrderedSnapshot(version, 3, settings.id, emptyList())
        `when`(repository.exists(version)).thenReturn(true)
        `when`(repository.snapshot(version)).thenReturn(saved)
        assertEquals(saved, content.save(version, request))
        verifyNoInteractions(catalog)
    }

    @Test
    fun `sealed roots are rejected before catalog availability is inspected`() {
        `when`(receipts.forVersion(version)).thenReturn(UUID(0, 4))
        val failure = assertThrows(ResponseStatusException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = emptyList())) }
        assertEquals("Successor roots are sealed for publication", failure.reason)
        verifyNoInteractions(catalog, repository)
    }

    @Test
    fun `unknown and published versions fail before structural settings are loaded`() {
        assertEquals("Unknown version '$version'", assertThrows(NotFoundException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = emptyList())) }.message)
        `when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "published", constitution))
        assertThrows(VersionPublishedException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = emptyList())) }
        verifyNoInteractions(repository)
    }

    @Test
    fun `missing constitution identity precedes missing pinned settings`() {
        `when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft"))
        assertEquals("Catalog did not supply constitution identity", assertThrows(CatalogUnavailableException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = emptyList())) }.message)
        `when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
        assertEquals("Version-pinned settings unavailable", assertThrows(CatalogUnavailableException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = emptyList())) }.message)
        verifyNoInteractions(repository)
    }

    @Test
    fun `target generation conflict precedes source lookup`() {
        `when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
        `when`(catalog.getSettings(version)).thenReturn(settings)
        `when`(repository.exists(version)).thenReturn(true)
        `when`(repository.snapshot(version)).thenReturn(OrderedSnapshot(version, 2, settings.id, emptyList()))
        `when`(repository.lock(version)).thenReturn(4)
        val failure = assertThrows(ResponseStatusException::class.java) { content.save(version, OrderedSnapshotWrite(3, sourceVersionId = UUID(0, 100), sourceGeneration = 0, roots = emptyList())) }
        assertEquals("Target roots changed", failure.reason)
    }

    @Test
    fun `receipt discovered during current snapshot load reuses it before locking`() {
        val attempt = UUID(0, 4)
        val request = OrderedSnapshotWrite(3, roots = emptyList(), publishAttemptId = attempt)
        val saved = OrderedSnapshot(version, 3, settings.id, emptyList())
        `when`(receipts.find(attempt)).thenReturn(null, OrderedPublishReceipt(version, com.constitutionatlas.platform.OrderedWriteFingerprint.current(request), 3))
        `when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
        `when`(catalog.getSettings(version)).thenReturn(settings)
        `when`(repository.exists(version)).thenReturn(true)
        `when`(repository.snapshot(version)).thenReturn(saved)
        assertEquals(saved, content.save(version, request))
    }

    @Test
    fun `duplicate node identity precedes kind validation on that occurrence`() {
        val root = node(10)
        assertEquals("Duplicate node logical identity '${root.logicalId}'", invalid(listOf(root, root.copy(kind = "unknown"))))
    }

    @Test
    fun `required title precedes label and content validation`() {
        val root = node(10)
        val required = settings.copy(outline = StructuralOutline(listOf(level("article").copy(titlePolicy = "required", labelPolicy = "required", mayHoldText = false))))
        assertEquals("Title is required at '${root.logicalId}'", invalid(listOf(root), required))
        assertEquals("Literal label is required at '${root.logicalId}'", invalid(listOf(root.copy(title = "Title")), required))
    }

    @Test
    fun `forbidden metadata permits empty values but rejects whitespace`() {
        val forbidden = settings.copy(outline = StructuralOutline(listOf(level("article").copy(titlePolicy = "none", labelPolicy = "none"))))
        content.validate(listOf(node(10).copy(title = "", label = "")), forbidden)
        assertEquals("Title is not permitted at '${UUID(0, 10)}'", invalid(listOf(node(10).copy(title = " ")), forbidden))
    }

    @Test
    fun `explicit root flags override the first configured level`() {
        val levels = settings.copy(outline = StructuralOutline(listOf(level("article"), level("section").copy(root = true))))
        assertEquals("Invalid kind 'article' at '${UUID(0, 10)}' at the root", invalid(listOf(node(10)), levels))
        content.validate(listOf(node(10).copy(kind = "section")), levels)
    }

    @Test
    fun `node and text identities share one global namespace`() {
        val root = node(10, listOf(OrderedEntry("text", logicalId = UUID(0, 10), text = "Exact  text")))
        assertEquals("Duplicate text logical identity '${root.logicalId}'", invalid(listOf(root)))
    }

    @Test
    fun `table shape and cell checks retain their diagnostic order`() {
        val rootId = UUID(0, 10)
        val cell = OrderedTableCell(UUID(0, 20), "Cell", rowSpan = 0, headers = listOf(UUID(0, 21)))
        val table = OrderedTable(rows = listOf(OrderedTableRow(UUID(0, 30), listOf(cell))))
        val entry = OrderedEntry("text", logicalId = UUID(0, 11), format = "table", text = "Cell", table = table)
        assertEquals("Invalid table cell at '$rootId'", invalid(listOf(node(10, listOf(entry)))))
        val fixedSpan = entry.copy(table = table.copy(rows = listOf(table.rows.single().copy(cells = listOf(cell.copy(rowSpan = 1))))))
        assertEquals("Unknown table header at '$rootId'", invalid(listOf(node(10, listOf(fixedSpan)))))
    }

    @Test
    fun `annotation format precedes unknown anchor rejection`() {
        val entry = OrderedEntry("text", logicalId = UUID(0, 11), text = "Body", annotation = OrderedAnnotation("editorial", anchorLogicalIds = listOf(UUID(0, 999))))
        assertEquals("Annotations must be anchored notes", invalid(listOf(node(10, listOf(entry)))))
        assertEquals("Annotation has an unknown unit anchor", invalid(listOf(node(10, listOf(entry.copy(format = "footnote"))))))
    }

    /** Provides a writable leaf whose kind can independently become an explicit root. */
    private fun level(kind: String) = StructuralLevel(kind, true, false, emptyList())

    /** Fixed fixture identities make exact diagnostics reproducible. */
    private fun node(value: Long, entries: List<OrderedEntry> = emptyList()) = OrderedNode(UUID(0, value), UUID(1, value), UUID(2, value), "article", null, null, entries)

    /** Full validation reports its first rejection without adapting error text. */
    private fun invalid(roots: List<OrderedNode>, selected: StructuralSettings = settings): String? = assertThrows(IllegalArgumentException::class.java) { content.validate(roots, selected) }.message
}

import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportNode
import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.service.ImportValidator
import com.constitutionatlas.platform.OrderedAnnotation
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedInlineReference
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedReferenceTarget
import com.constitutionatlas.platform.OrderedTable
import com.constitutionatlas.platform.OrderedTableCell
import com.constitutionatlas.platform.OrderedTableRow
import com.constitutionatlas.platform.SourceEvidence
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class ImportValidatorContractTest {
    @Test
    fun `metadata diagnostics retain their complete ordered public messages`() {
        val invalid = request().copy(
            isoCode = "D",
            countryName = " ",
            constitutionSlug = "",
            versionLabel = "",
            sourceUrl = "",
            roots = emptyList(),
            expectedCounts = mapOf("unsupported" to -1),
            sourceEvidence = SourceEvidence(datePrecision = "invalid"),
        )
        assertEquals(
            listOf(
                "MANIFEST_COUNTS" to "Manifest counts must name supported nonnegative resource counts",
                "SOURCE_EVIDENCE" to "Unsupported source date precision",
                "INVALID_ISO" to "isoCode must be two letters",
                "MISSING_COUNTRY" to "countryName is required",
                "MISSING_SLUG" to "constitutionSlug is required",
                "MISSING_VERSION" to "versionLabel is required",
                "MISSING_SOURCE" to "sourceUrl or gazetteReference is required",
                "INVALID_SOURCE_URL" to "sourceUrl must use HTTPS",
                "NO_ARTICLES" to "at least one article is required",
            ),
            ImportValidator.validate(invalid),
        )
    }

    @Test
    fun `jurisdiction imports bypass country metadata while conflicting selectors are rejected`() {
        val scoped = request().copy(jurisdictionId = UUID.randomUUID(), isoCode = "", countryName = "")
        assertTrue(ImportValidator.validate(scoped).isEmpty())
        assertEquals(
            listOf("AMBIGUOUS_JURISDICTION" to "Use jurisdictionId or isoCode, not both"),
            ImportValidator.validate(scoped.copy(isoCode = "DE")),
        )
        assertTrue(ImportValidator.validate(request().copy(sourceUrl = null, gazetteReference = "Official gazette")).isEmpty())
    }

    @Test
    fun `manifest accepts every supported zero count and rejects negative known counts`() {
        val counts = listOf("units", "textEntries", "tables", "cells", "footnotes", "references", "documents").associateWith { 0 }
        assertTrue(ImportValidator.validate(request().copy(expectedCounts = counts)).isEmpty())
        assertEquals(
            listOf("MANIFEST_COUNTS" to "Manifest counts must name supported nonnegative resource counts"),
            ImportValidator.validate(request().copy(expectedCounts = counts + ("units" to -1))),
        )
    }

    @Test
    fun `pinned outline overrides upload outline and retains raw root kind checks`() {
        val pin = ImportOutline(listOf(ImportOutlineKind("section", "Section")))
        val upload = request().copy(outline = ImportOutline(listOf(ImportOutlineKind("article", "Article"))))
        assertTrue(ImportValidator.validate(upload.copy(roots = listOf(OrderedNodeWrite(kind = "section"))), pin).isEmpty())
        assertEquals(listOf("ROOT_KIND" to "Roots must use one of article"), ImportValidator.validate(upload.copy(roots = listOf(OrderedNodeWrite(kind = " ARTICLE ")))))
        assertEquals(setOf("section"), ImportValidator.allowedKinds(upload, pin))
        assertEquals(setOf("article"), ImportValidator.allowedKinds(upload, ImportOutline()))
    }

    @Test
    fun `explicit child kinds override adjacent level inference and text permission depends on configured children`() {
        val nested = OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "paragraph"))))
        val inferred = ImportOutline(listOf(ImportOutlineKind("article", "Article"), ImportOutlineKind("paragraph", "Paragraph")))
        assertTrue(ImportValidator.validate(request().copy(roots = listOf(nested)), inferred).isEmpty())
        val leaf = inferred.copy(kinds = listOf(inferred.kinds.first().copy(allowedChildKinds = emptyList()), inferred.kinds.last()))
        assertEquals(
            listOf("HIERARCHY_KIND" to "roots[0].content[0].node: 'paragraph' is not allowed under 'article'"),
            ImportValidator.validate(request().copy(roots = listOf(nested)), leaf),
        )
        val textOnly = request().copy(roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", text = "Opening")))))
        assertEquals(listOf("TEXT_ALONGSIDE_CHILDREN" to "roots[0]: text is not allowed in 'article'"), ImportValidator.validate(textOnly, inferred))
        assertTrue(ImportValidator.validate(textOnly, leaf).isEmpty())
        assertTrue(ImportValidator.validate(textOnly, inferred.copy(kinds = listOf(inferred.kinds.first().copy(allowTextAlongsideChildren = true), inferred.kinds.last()))).isEmpty())
    }

    @Test
    fun `ordered traversal visits descendants before validating their containing entry`() {
        val shared = UUID.randomUUID()
        val child = OrderedNodeWrite(kind = "paragraph", logicalId = shared, revisionId = UUID.randomUUID())
        val root = OrderedNodeWrite(kind = "article", logicalId = shared, content = listOf(OrderedEntryWrite("child", node = child, logicalId = shared, revisionId = UUID.randomUUID())))
        val outline = ImportOutline(listOf(ImportOutlineKind("article", "Article"), ImportOutlineKind("paragraph", "Paragraph")))
        assertEquals(
            listOf(
                "REVISION_REFERENCE" to "roots[0].content[0].node: ancestry requires a pinned predecessor version; stored revision reuse is not supported",
                "DUPLICATE_LOGICAL_ID" to "Logical identities must be unique",
                "DUPLICATE_LOGICAL_ID" to "Logical identities must be unique",
                "REVISION_REFERENCE" to "roots[0].content[0]: ancestry requires a pinned predecessor version; stored revision reuse is not supported",
            ),
            ImportValidator.validate(request().copy(roots = listOf(root)), outline),
        )
    }

    @Test
    fun `logical identities are shared across nodes text entries and all roots`() {
        val identity = UUID.randomUUID()
        val roots = listOf(
            OrderedNodeWrite(kind = "article", logicalId = identity),
            OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", logicalId = identity, text = "Same identity"))),
        )
        assertEquals(listOf("DUPLICATE_LOGICAL_ID" to "Logical identities must be unique"), ImportValidator.validate(request().copy(roots = roots)))
        assertTrue(ImportValidator.validate(request().copy(roots = listOf(roots.first()))).isEmpty())
    }

    @Test
    fun `annotation errors precede format and table errors in the same entry`() {
        val entry = OrderedEntryWrite("text", text = "Body", format = "plain", table = OrderedTable(rows = emptyList()), annotation = OrderedAnnotation(kind = "unsupported"))
        assertEquals(
            listOf(
                "ANNOTATION" to "Unsupported annotation kind",
                "ANNOTATION" to "roots[0].content[0]: annotations require a footnote entry",
                "RICH_FORMAT" to "roots[0].content[0]: format and table payload must agree",
                "TABLE_SHAPE" to "roots[0].content[0]: table rows need cells",
            ),
            ImportValidator.validate(requestWithEntry(entry)),
        )
    }

    @Test
    fun `table cells resolve forward header targets and preserve precise invalid cell paths`() {
        val headerId = UUID.randomUUID()
        val cell = OrderedTableCell(UUID.randomUUID(), "Value", headers = listOf(headerId))
        val table = OrderedTable(rows = listOf(OrderedTableRow(UUID.randomUUID(), listOf(cell)), OrderedTableRow(UUID.randomUUID(), listOf(OrderedTableCell(headerId, "Header", header = true)))))
        val entry = OrderedEntryWrite("text", format = "table", table = table)
        assertTrue(ImportValidator.validate(requestWithEntry(entry)).isEmpty())
        val invalidRows = listOf(
            OrderedTableRow(UUID.randomUUID(), emptyList()),
            OrderedTableRow(UUID.randomUUID(), listOf(cell.copy(rowSpan = 0), cell.copy(colSpan = 101), cell.copy(headers = listOf(UUID.randomUUID())))),
        )
        assertEquals(
            listOf(
                "TABLE_SHAPE" to "roots[0].content[0]: table rows need cells",
                "TABLE_CELL" to "roots[0].content[0].table.rows[1].cells[0]: invalid span or header target",
                "TABLE_CELL" to "roots[0].content[0].table.rows[1].cells[1]: invalid span or header target",
                "TABLE_CELL" to "roots[0].content[0].table.rows[1].cells[2]: invalid span or header target",
            ),
            ImportValidator.validate(requestWithEntry(entry.copy(table = table.copy(rows = invalidRows)))),
        )
    }

    @Test
    fun `legacy validation preserves mixed content numbering ordering kind and hierarchy diagnostics`() {
        val child = ImportNode(" Strange ", body = "Exact child")
        val articles = listOf(
            ImportArticle(" 1 ", "First", "Distinct opening", 0, listOf(child)),
            ImportArticle("1", "Second", sortOrder = 0, nodes = listOf(child)),
            ImportArticle(" ", "Third", sortOrder = 4),
        )
        val outline = ImportOutline(listOf(ImportOutlineKind("section", "Section"), ImportOutlineKind("article", "Article")))
        assertEquals(
            listOf(
                "MIXED_LEGACY_CONTENT" to "Use ordered roots to preserve distinct text alongside child units; legacy body may only repeat the child projection",
                "BLANK_NUMBER" to "articleNumber must not be blank",
                "DUPLICATE_NUMBER" to "article numbers must be unique",
                "DUPLICATE_ORDER" to "sortOrder values must be unique",
                "INVALID_ORDER" to "sortOrder must be >= 1",
                "ORDER_GAPS" to "sortOrder must be a contiguous sequence starting at 1",
                "UNKNOWN_KIND" to "kind 'strange' is not in the outline",
                "ROOT_KIND" to "Article format requires an article root; use roots for this outline",
                "HIERARCHY_KIND" to "articles[0].nodes[0]: ' Strange ' is not allowed under 'article'",
                "HIERARCHY_KIND" to "articles[1].nodes[0]: ' Strange ' is not allowed under 'article'",
            ),
            ImportValidator.validate(request().copy(roots = emptyList(), articles = articles), outline),
        )
    }

    @Test
    fun `legacy projections recurse through children and reject distinct nested opening wording`() {
        val leaves = listOf(ImportNode("sentence", body = "First."), ImportNode("sentence", body = "Second."))
        val paragraph = ImportNode("paragraph", body = "First. Second.", children = leaves)
        val article = ImportArticle("1", "Title", "First. Second.", 1, listOf(paragraph))
        val outline = ImportOutline(listOf(ImportOutlineKind("article", "Article"), ImportOutlineKind("paragraph", "Paragraph"), ImportOutlineKind("sentence", "Sentence")))
        val valid = request().copy(roots = emptyList(), articles = listOf(article))
        assertTrue(ImportValidator.validate(valid, outline).isEmpty())
        val noAggregateBody = article.copy(body = "", nodes = listOf(paragraph.copy(body = null)))
        assertTrue(ImportValidator.validate(valid.copy(articles = listOf(noAggregateBody)), outline).isEmpty())
        val distinctOpening = article.copy(nodes = listOf(paragraph.copy(body = "Distinct nested opening")))
        assertEquals(
            listOf("MIXED_LEGACY_CONTENT" to "Use ordered roots to preserve distinct text alongside child units; legacy body may only repeat the child projection"),
            ImportValidator.validate(valid.copy(articles = listOf(distinctOpening)), outline),
        )
    }

    @Test
    fun `legacy hierarchy keeps the authored parent spelling during recursive lookup`() {
        val paragraph = ImportNode(" PARAGRAPH ", children = listOf(ImportNode("sentence", body = "Exact wording")))
        val outline = ImportOutline(listOf(ImportOutlineKind("article", "Article"), ImportOutlineKind("paragraph", "Paragraph"), ImportOutlineKind("sentence", "Sentence")))
        val article = ImportArticle("1", "Title", sortOrder = 1, nodes = listOf(paragraph))
        assertEquals(
            listOf("HIERARCHY_KIND" to "articles[0].nodes[0].children[0]: 'sentence' is not allowed under ' PARAGRAPH '"),
            ImportValidator.validate(request().copy(roots = emptyList(), articles = listOf(article)), outline),
        )
    }

    @Test
    fun `annotations are validated on child entries as well as text entries`() {
        val child = OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "paragraph"), annotation = OrderedAnnotation("unsupported"))
        val outline = ImportOutline(listOf(ImportOutlineKind("article", "Article"), ImportOutlineKind("paragraph", "Paragraph")))
        assertEquals(
            listOf(
                "ANNOTATION" to "Unsupported annotation kind",
                "ANNOTATION" to "roots[0].content[0]: annotations require a footnote entry",
            ),
            ImportValidator.validate(requestWithEntry(child), outline),
        )
    }

    @Test
    fun `implicit child lookup preserves the first equal outline level for duplicate entries`() {
        val paragraph = ImportOutlineKind("paragraph", "Paragraph")
        val outline = ImportOutline(listOf(ImportOutlineKind("article", "Article"), paragraph, ImportOutlineKind("sentence", "Sentence"), paragraph.copy()))
        val sentence = OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "sentence"))
        val child = OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "paragraph", content = listOf(sentence)))
        assertTrue(ImportValidator.validate(requestWithEntry(child), outline).isEmpty())
    }

    @Test
    fun `rich reference failures keep input indices and follow structural failures`() {
        val reference = OrderedInlineReference(UUID.randomUUID(), 1, 3, OrderedReferenceTarget("external", url = "https://example.org"))
        val references = listOf(reference, reference.copy(logicalId = UUID.randomUUID(), start = 0, end = 2))
        val entry = OrderedEntryWrite("text", text = "ABC", format = "unsupported", references = references)
        val errors = ImportValidator.validate(requestWithEntry(entry))
        assertEquals(
            listOf(
                "RICH_FORMAT" to "roots[0].content[0]: format and table payload must agree",
                "INLINE_REFERENCE" to "INLINE_REFERENCE: roots[0].content[0].references[1]: Invalid, overlapping or unresolved inline reference",
                "INLINE_REFERENCE" to "INLINE_REFERENCE: roots[0].content[0].references[0]: Invalid, overlapping or unresolved inline reference",
            ),
            errors,
        )
        val disjoint = entry.copy(format = null, references = listOf(reference.copy(start = 2), references.last()))
        assertTrue(ImportValidator.validate(requestWithEntry(disjoint)).isEmpty())
    }

    /** A valid ordered import keeps each test focused on the supplied mutation. */
    private fun request(): ImportRequest = ImportRequest(
        isoCode = "DE",
        countryName = "Germany",
        constitutionSlug = "contract",
        constitutionTitle = "Contract",
        versionLabel = "1",
        sourceUrl = "https://example.org/source",
        roots = listOf(OrderedNodeWrite(kind = "article")),
    )

    /** Place one rich entry at a stable public error path. */
    private fun requestWithEntry(entry: OrderedEntryWrite): ImportRequest =
        request().copy(roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(entry))))
}

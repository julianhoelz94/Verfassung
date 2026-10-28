import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.service.ImportValidator
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNodeWrite
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class ImportValidatorTest {
    @Test
    fun `sentence settings accept Unicode punctuation only on a leaf`() {
        val leaf = ImportOutlineKind("sentence", "Sentence", segmentation = "sentence", allowedChildKinds = emptyList(), sentenceDelimiters = listOf(";", "。"))
        assertTrue(ImportValidator.outlineSentenceErrors(listOf(leaf)).isEmpty())
        assertTrue(ImportValidator.outlineSentenceErrors(listOf(leaf.copy(sentenceDelimiters = emptyList()))).any { it.first == "SENTENCE_DELIMITERS" })
        assertTrue(ImportValidator.outlineSentenceErrors(listOf(leaf.copy(sentenceDelimiters = listOf("word")))).any { it.first == "SENTENCE_DELIMITERS" })
        assertTrue(ImportValidator.outlineSentenceErrors(listOf(leaf.copy(allowedChildKinds = listOf("clause")))).any { it.first == "SENTENCE_SEGMENTATION" })
        assertTrue(ImportValidator.outlineSentenceErrors(listOf(leaf.copy(labelPolicy = "required"))).any { it.first == "SENTENCE_SEGMENTATION" })
        assertTrue(ImportValidator.outlineSentenceErrors(listOf(leaf.copy(titlePolicy = "required"))).any { it.first == "SENTENCE_SEGMENTATION" })
    }

    @Test
    fun `every structured import validates the complete endnotes sequence and marks`() {
        val noteId = UUID.randomUUID()
        val note = OrderedEntryWrite("text", logicalId = noteId, text = "Source note", format = "footnote", marks = listOf(com.constitutionatlas.platform.OrderedTextMark("italic", 0, 6)))
        val body = OrderedEntryWrite("text", text = "Law", references = listOf(com.constitutionatlas.platform.OrderedInlineReference(UUID.randomUUID(), 3, 3, com.constitutionatlas.platform.OrderedReferenceTarget("footnote", footnoteId = noteId))))
        val request = ImportRequest(isoCode = "DE", countryName = "Germany", constitutionSlug = "test", constitutionTitle = "Test", versionLabel = "1", sourceUrl = "https://example.org/source", roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(body)), OrderedNodeWrite(kind = "article", content = listOf(note))))
        assertTrue(ImportValidator.validate(request).isEmpty())
        val invalidOrder = ImportValidator.validate(request.copy(roots = request.roots.reversed()))
        assertTrue(invalidOrder.any { it.first == "FOOTNOTE_NOT_AT_END" && it.second.contains("roots[1]") })
        val invalidMark = request.roots.last().copy(content = listOf(note.copy(marks = listOf(com.constitutionatlas.platform.OrderedTextMark("bold", 0, 100)))))
        assertTrue(ImportValidator.validate(request.copy(roots = listOf(request.roots.first(), invalidMark))).any { it.first == "TEXT_MARK_RANGE" })
    }

    @Test
    fun `complete imports resolve cross-root node and text reference targets`() {
        val nodeId = UUID.randomUUID()
        val textId = UUID.randomUUID()
        val references = listOf(
            com.constitutionatlas.platform.OrderedInlineReference(UUID.randomUUID(), 0, 1, com.constitutionatlas.platform.OrderedReferenceTarget("unit", logicalId = nodeId)),
            com.constitutionatlas.platform.OrderedInlineReference(UUID.randomUUID(), 1, 2, com.constitutionatlas.platform.OrderedReferenceTarget("unit", logicalId = textId)),
        )
        val source = OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", text = "AB", references = references)))
        val target = OrderedNodeWrite(logicalId = nodeId, kind = "article", content = listOf(OrderedEntryWrite("text", logicalId = textId, text = "Target")))
        assertTrue(ImportValidator.richContentErrors(listOf(source, target)).isEmpty())
        assertTrue(ImportValidator.richContentErrors(listOf(source)).all { it.first == "UNIT_REFERENCE_TARGET" })
    }

    @Test
    fun `legacy aggregate bodies remain compatible while distinct mixed wording is rejected`() {
        val node = com.constitutionatlas.ingestion.api.ImportNode("paragraph", body = "Exact text")
        val article = com.constitutionatlas.ingestion.api.ImportArticle("1", "Title", "Exact text", 1, listOf(node))
        val request = ImportRequest(isoCode = "DE", countryName = "Germany", constitutionSlug = "test", constitutionTitle = "Test", versionLabel = "1", sourceUrl = "https://example.org/source", articles = listOf(article))
        assertTrue(ImportValidator.validate(request).none { it.first == "MIXED_LEGACY_CONTENT" })
        assertTrue(ImportValidator.validate(request.copy(articles = listOf(article.copy(body = "Distinct opening")))).any { it.first == "MIXED_LEGACY_CONTENT" })
    }

    @Test
    fun `exported node and text ancestry require a pin without permitting stored revision reuse`() {
        val text = OrderedEntryWrite(type = "text", text = "Split text", lineage = listOf(UUID.randomUUID()))
        val root = OrderedNodeWrite(kind = "article", lineage = listOf(UUID.randomUUID()), content = listOf(text))
        val request = ImportRequest(
            isoCode = "FR",
            countryName = "France",
            constitutionSlug = "1958",
            constitutionTitle = "Constitution",
            versionLabel = "2",
            sourceUrl = "https://example.org/source",
            predecessorVersionId = UUID.randomUUID(),
            roots = listOf(root),
        )
        assertTrue(ImportValidator.validate(request).isEmpty())
        val unpinned = ImportValidator.validate(request.copy(predecessorVersionId = null))
        assertTrue(unpinned.count { it.first == "REVISION_REFERENCE" } == 2)
        for (stored in listOf(
            root.copy(revisionId = UUID.randomUUID()),
            root.copy(content = listOf(text.copy(revisionId = UUID.randomUUID()))),
        )) {
            assertTrue(ImportValidator.validate(request.copy(roots = listOf(stored))).any { it.first == "REVISION_REFERENCE" })
        }
    }

    @Test
    fun `pinned outline permits its configured root kind`() {
        val request = ImportRequest(
            isoCode = "FR",
            countryName = "France",
            constitutionSlug = "1958",
            constitutionTitle = "Constitution",
            versionLabel = "1",
            sourceUrl = "https://example.org/source",
            roots = listOf(OrderedNodeWrite(kind = "section", label = "I")),
        )
        val outline = ImportOutline(listOf(ImportOutlineKind("section", "Section")))
        assertTrue(ImportValidator.validate(request, outline).isEmpty())
    }

    @Test
    fun `nested ordered kinds must belong to pinned outline`() {
        val request = ImportRequest(
            isoCode = "FR",
            countryName = "France",
            constitutionSlug = "1958",
            constitutionTitle = "Constitution",
            versionLabel = "1",
            sourceUrl = "https://example.org/source",
            roots = listOf(
                OrderedNodeWrite(
                    kind = "section",
                    content = listOf(
                        OrderedEntryWrite(type = "child", node = OrderedNodeWrite(kind = "unknown")),
                    ),
                ),
            ),
        )
        val outline = ImportOutline(listOf(ImportOutlineKind("section", "Section")))
        assertTrue(ImportValidator.validate(request, outline).any { it.first == "UNKNOWN_KIND" })
    }

    @Test
    fun `full upload needs a source and the expected hierarchy`() {
        val request = ImportRequest(
            isoCode = "FR",
            countryName = "France",
            constitutionSlug = "1958",
            constitutionTitle = "Constitution",
            versionLabel = "1",
            roots = listOf(
                OrderedNodeWrite(
                    kind = "article",
                    content = listOf(
                        OrderedEntryWrite(type = "child", node = OrderedNodeWrite(kind = "sentence")),
                    ),
                ),
            ),
        )
        val outline = ImportOutline(listOf(ImportOutlineKind("article", "Article"), ImportOutlineKind("paragraph", "Paragraph"), ImportOutlineKind("sentence", "Sentence")))
        val errors = ImportValidator.validate(request, outline).map { it.first }
        assertTrue("MISSING_SOURCE" in errors)
        assertTrue("HIERARCHY_KIND" in errors)
    }
}

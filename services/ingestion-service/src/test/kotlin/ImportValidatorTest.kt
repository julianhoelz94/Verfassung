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

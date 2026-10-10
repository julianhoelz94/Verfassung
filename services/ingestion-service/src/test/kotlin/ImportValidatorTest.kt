import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.service.ImportValidator
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNodeWrite
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ImportValidatorTest {
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

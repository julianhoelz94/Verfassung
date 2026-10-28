import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.service.CatalogWriteService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class OutlineCapabilitiesTest {
    @Test
    fun superscriptLabelsAreLeafDisplayAndDoNotRevokeTitlePermission() {
        val outline = CatalogWriteService.normalizeOutline(listOf(OutlineKindWrite("clause", "Clause", titlePolicy = "optional", showTitle = false, labelPlacement = "superscript")))
        assertEquals("optional", outline.single().titlePolicy)
        assertEquals("superscript", outline.single().labelPlacement)
        assertThrows(IllegalArgumentException::class.java) { CatalogWriteService.normalizeOutline(listOf(OutlineKindWrite("part", "Part", labelPlacement = "superscript"), OutlineKindWrite("clause", "Clause"))) }
    }

    @Test
    fun parentTextAndLiteralLabelPoliciesAreExplicit() {
        val outline = CatalogWriteService.normalizeOutline(
            listOf(
                OutlineKindWrite("article", "Article", allowTextAlongsideChildren = true),
                OutlineKindWrite("clause", "Clause", labelPolicy = "required", segmentation = "plain"),
            ),
        )
        assertEquals(true, outline.first().allowTextAlongsideChildren)
        assertEquals("required", outline.last().labelPolicy)
        assertEquals("plain", outline.last().segmentation)
    }

    @Test
    fun invalidCapabilitiesAreRejected() {
        val invalid = listOf(
            listOf(OutlineKindWrite("sentence", "Sentence"), OutlineKindWrite("clause", "Clause")),
            listOf(OutlineKindWrite("article", "Article", allowTextAlongsideChildren = true)),
            listOf(OutlineKindWrite("article", "Article", titlePolicy = "none", showTitle = true)),
            listOf(OutlineKindWrite("article", "Article", labelPlacement = "generated")),
            listOf(OutlineKindWrite("article", "Article", segmentation = "sentence"), OutlineKindWrite("clause", "Clause")),
            listOf(OutlineKindWrite("clause", "Clause", segmentation = "sentence", labelPolicy = "required")),
            listOf(OutlineKindWrite("clause", "Clause", segmentation = "sentence", titlePolicy = "required")),
        )
        invalid.forEach { kinds ->
            assertThrows(IllegalArgumentException::class.java) { CatalogWriteService.normalizeOutline(kinds) }
        }
    }

    @Test
    fun automaticSentenceCreationUsesConfiguredPunctuationOnAnyLeafKind() {
        val leaf = OutlineKindWrite("provision", "Provision", segmentation = "sentence", sentenceDelimiters = listOf(";", "。", "?!"))
        assertEquals(leaf.sentenceDelimiters, CatalogWriteService.normalizeOutline(listOf(leaf)).single().sentenceDelimiters)
        assertEquals(listOf(".", "!", "?"), CatalogWriteService.normalizeOutline(listOf(leaf.copy(sentenceDelimiters = listOf(".", "!", "?")))).single().sentenceDelimiters)
        assertThrows(IllegalArgumentException::class.java) {
            CatalogWriteService.normalizeOutline(listOf(leaf.copy(allowedChildKinds = listOf("clause")), OutlineKindWrite("clause", "Clause")))
        }
    }

    @Test
    fun automaticCreationRejectsEmptyAmbiguousAndUnboundedDelimiterConfigurations() {
        val leaf = OutlineKindWrite("clause", "Clause", segmentation = "sentence")
        val invalid = listOf(emptyList(), listOf(""), listOf(" ", "."), listOf("end"), listOf("1"), listOf(".", "."), listOf("........."), (1..17).map { "!" + ".".repeat(it) })
        invalid.forEach { delimiters ->
            assertThrows(IllegalArgumentException::class.java) {
                CatalogWriteService.normalizeOutline(listOf(leaf.copy(sentenceDelimiters = delimiters)))
            }
        }
        assertEquals(emptyList<String>(), CatalogWriteService.normalizeOutline(listOf(leaf.copy(segmentation = "plain", sentenceDelimiters = emptyList()))).single().sentenceDelimiters)
    }
}

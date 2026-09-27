import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.service.CatalogWriteService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class OutlineCapabilitiesTest {
    @Test
    fun parentTextAndLiteralLabelPoliciesAreExplicit() {
        val outline = CatalogWriteService.normalizeOutline(
            listOf(
                OutlineKindWrite("article", "Article", allowTextAlongsideChildren = true),
                OutlineKindWrite("clause", "Clause", labelPolicy = "required", segmentation = "sentence"),
            ),
        )
        assertEquals(true, outline.first().allowTextAlongsideChildren)
        assertEquals("required", outline.last().labelPolicy)
        assertEquals("sentence", outline.last().segmentation)
    }

    @Test
    fun invalidCapabilitiesAreRejected() {
        val invalid = listOf(
            listOf(OutlineKindWrite("sentence", "Sentence"), OutlineKindWrite("clause", "Clause")),
            listOf(OutlineKindWrite("article", "Article", allowTextAlongsideChildren = true)),
            listOf(OutlineKindWrite("article", "Article", titlePolicy = "none", showTitle = true)),
            listOf(OutlineKindWrite("article", "Article", labelPlacement = "generated")),
            listOf(OutlineKindWrite("article", "Article", segmentation = "sentence"), OutlineKindWrite("clause", "Clause")),
        )
        invalid.forEach { kinds ->
            assertThrows(IllegalArgumentException::class.java) { CatalogWriteService.normalizeOutline(kinds) }
        }
    }
}

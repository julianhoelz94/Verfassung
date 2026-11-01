import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.service.CatalogWriteService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class CatalogOutlineContractTest {
    @Test
    fun `normalization infers children from raw next declarations and defaults only absent roots`() {
        val result = normalize(listOf(kind(" ARTICLE ").copy(presentation = " SECTION "), kind(" CLAUSE ").copy(root = true)))
        assertEquals(listOf("article", "clause"), result.map { it.kindCode })
        assertEquals(listOf("clause"), result.first().allowedChildKinds)
        assertTrue(result.first().root!!)
        assertTrue(result.last().root!!)
        assertEquals("section", result.first().presentation)
    }

    @Test
    fun `explicit empty children do not infer an adjacent level and explicit false root stays false`() {
        val result = normalize(listOf(kind("article").copy(allowedChildKinds = emptyList()), kind("clause").copy(root = true)))
        assertEquals(emptyList<String>(), result.first().allowedChildKinds)
        val roots = normalize(listOf(kind("article").copy(root = false, allowedChildKinds = emptyList()), kind("clause").copy(root = true, allowedChildKinds = listOf("article"))))
        assertFalse(roots.first().root!!)
    }

    @Test
    fun `layer validation precedes global duplicate checks`() {
        val bad = listOf(kind("article"), kind("article").copy(displayLabel = " "))
        assertEquals("displayLabel is required for layer 2", failure(bad))
        assertEquals("kindCode values must be unique", failure(bad.map { it.copy(displayLabel = "Valid") }))
    }

    @Test
    fun `kind label presentation and leaf permissions retain validation order`() {
        assertEquals("outline must have at least one layer", failure(emptyList()))
        assertEquals("kindCode '1-invalid' must be a lowercase slug", failure(listOf(kind("1-invalid").copy(displayLabel = "", presentation = "bad"))))
        assertEquals("presentation must be section or concatenated", failure(listOf(kind("article").copy(presentation = "bad", titlePolicy = "bad"))))
        assertEquals("sentence cannot have child units", failure(listOf(kind("sentence"), kind("clause"))))
        assertEquals("a leaf has no child units", failure(listOf(kind("article").copy(allowTextAlongsideChildren = true))))
    }

    @Test
    fun `authoring policies precede label placement and segmentation checks`() {
        assertEquals("titlePolicy and labelPolicy must be none, optional or required", failure(listOf(kind("article").copy(titlePolicy = "bad", labelPlacement = "bad"))))
        assertEquals("public title display requires editor title permission", failure(listOf(kind("article").copy(titlePolicy = "none", showTitle = true, labelPlacement = "bad"))))
        assertEquals("public label display requires literal label permission", failure(listOf(kind("article").copy(labelPolicy = "none", labelPlacement = "bad"))))
        assertEquals("labelPlacement must be before_title, after_title, inline or superscript", failure(listOf(kind("article").copy(labelPlacement = "bad"))))
    }

    @Test
    fun `sentence delimiters count unicode code points and plain leaves may omit them`() {
        val delimiters = listOf("。", "😀".repeat(8), "?!")
        assertEquals(delimiters, normalize(listOf(kind("clause").copy(segmentation = "sentence", sentenceDelimiters = delimiters))).single().sentenceDelimiters)
        assertEquals(emptyList<String>(), normalize(listOf(kind("clause").copy(sentenceDelimiters = emptyList()))).single().sentenceDelimiters)
        assertEquals("sentenceDelimiters must contain up to 16 unique punctuation sequences of 1 to 8 characters; automatic sentence creation requires at least one", failure(listOf(kind("clause").copy(segmentation = "sentence", sentenceDelimiters = listOf("😀".repeat(9))))))
    }

    @Test
    fun `graph validation rejects rootless unknown duplicate and unreachable edges in order`() {
        assertEquals("outline needs a root kind", failure(listOf(kind("article").copy(root = false))))
        assertEquals("duplicate child kind for 'article'", failure(listOf(kind("article").copy(allowedChildKinds = listOf("missing", "missing")))))
        assertEquals("unknown child kind 'missing' for 'article'", failure(listOf(kind("article").copy(allowedChildKinds = listOf("missing")))))
        assertEquals("every kind must be reachable from a root", failure(listOf(kind("article").copy(allowedChildKinds = emptyList()), kind("clause"))))
    }

    @Test
    fun `cycle detection precedes the visited shortcut and shared acyclic children remain valid`() {
        assertEquals("outline cycle at 'article'", failure(listOf(kind("article").copy(allowedChildKinds = listOf("clause")), kind("clause").copy(allowedChildKinds = listOf("article")))))
        val result = normalize(listOf(kind("article").copy(allowedChildKinds = listOf("clause")), kind("part").copy(root = true, allowedChildKinds = listOf("clause")), kind("clause").copy(allowedChildKinds = emptyList())))
        assertEquals(listOf("article", "part", "clause"), result.map { it.kindCode })
    }

    /** Minimal authored layers retain display and authoring defaults used by the public write API. */
    private fun kind(code: String) = OutlineKindWrite(code, code.trim())

    /** Public entry point is used so these contracts apply before and after helper extraction. */
    private fun normalize(kinds: List<OutlineKindWrite>) = CatalogWriteService.normalizeOutline(kinds)

    /** Exposes the exact first rejection message, rather than testing implementation details. */
    private fun failure(kinds: List<OutlineKindWrite>) = assertThrows(IllegalArgumentException::class.java) { normalize(kinds) }.message
}

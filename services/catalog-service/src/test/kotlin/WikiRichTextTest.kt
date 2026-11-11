import com.constitutionatlas.catalog.api.WikiCitation
import com.constitutionatlas.catalog.service.WikiRichText
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

class WikiRichTextTest {
    private val mapper = JsonMapper.builder().build()
    private val documentId = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    private val pin = WikiCitation(documentId, 2, "Exact source")
    private val citation = """{"type":"citation","attrs":{"reference":{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","documentId":"$documentId","revision":2,"locator":"Article 1(1)"}}}"""
    private fun document(content: String) = mapper.readTree("""{"type":"doc","content":[$content]}""")

    @Test
    fun derivesLegacyTextWhilePreservingRichContentAndReferencePins() {
        val rich = document(
            """
          {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"History"}]},
          {"type":"paragraph","content":[{"type":"text","text":"Dignity","marks":[{"type":"strong"},{"type":"em"},{"type":"underline"},{"type":"text_color","attrs":{"color":"#355a47"}}]},$citation]},
          {"type":"ordered_list","attrs":{"order":3},"content":[{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"First"}]}]}]},
          {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"Quoted"},{"type":"hard_break"},{"type":"text","text":"line"}]}]}
            """.trimIndent(),
        )
        assertThat(WikiRichText.body(rich, listOf(pin))).isEqualTo("## History\n\nDignity\n\n3. First\n\nQuoted\nline")
        assertThat(rich.toString()).contains("Article 1(1)", "#355a47")
        assertThat(WikiRichText.body(null, emptyList())).isNull()
    }

    @Test
    fun requiresEveryInlineReferenceToHaveTheSameExplicitManifestPin() {
        val rich = document("""{"type":"paragraph","content":[$citation]}""")
        assertThrows(IllegalArgumentException::class.java) { WikiRichText.body(rich, emptyList()) }
        assertThrows(IllegalArgumentException::class.java) { WikiRichText.body(rich, listOf(pin.copy(revision = 3))) }
        assertThat(WikiRichText.body(rich, listOf(pin))).isEmpty()
        val duplicated = document("""{"type":"paragraph","content":[$citation,$citation]}""")
        assertThrows(IllegalArgumentException::class.java) { WikiRichText.body(duplicated, listOf(pin)) }
    }

    @Test
    fun rejectsUnboundedOrExecutableDocumentShapes() {
        val invalid = listOf(
            """{"type":"paragraph","attrs":{"onclick":"alert(1)"}}""",
            """{"type":"html","text":"<script>alert(1)</script>"}""",
            """{"type":"heading","attrs":{"level":4}}""",
            """{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"text_color","attrs":{"color":"url(javascript:alert(1))"}}]}]}""",
            """{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"strong"},{"type":"strong"}]}]}""",
            """{"type":"bullet_list","content":[{"type":"paragraph"}]}""",
            """{"type":"list_item","content":[{"type":"paragraph"}]}""",
            """{"type":"paragraph","content":[{"type":"text","text":"${"x".repeat(20001)}"}]}""",
        )
        invalid.forEach { value -> assertThrows(IllegalArgumentException::class.java) { WikiRichText.body(document(value), emptyList()) } }
        var nested = """{"type":"paragraph"}"""
        repeat(14) { nested = """{"type":"blockquote","content":[$nested]}""" }
        assertThrows(IllegalArgumentException::class.java) { WikiRichText.body(document(nested), emptyList()) }
    }

    @Test
    fun preservesAuthoredLiteralMarkupAsTextAndAllowsDistinctLocators() {
        val second = citation.replace("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "cccccccc-cccc-4ccc-8ccc-cccccccccccc").replace("Article 1(1)", "p. 12")
        val rich = document("""{"type":"paragraph","content":[{"type":"text","text":"<b>literal</b>"},$citation,$second]}""")
        assertThat(WikiRichText.body(rich, listOf(pin))).isEqualTo("<b>literal</b>")
    }
}

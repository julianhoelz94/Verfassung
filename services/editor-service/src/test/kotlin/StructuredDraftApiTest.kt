import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.EditorServiceApplication
import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.api.DraftSource
import com.constitutionatlas.editor.api.StructuredDraftSave
import com.constitutionatlas.editor.api.TextPart
import com.constitutionatlas.editor.client.DraftLevel
import com.constitutionatlas.editor.client.DraftOutline
import com.constitutionatlas.editor.client.DraftSettings
import com.constitutionatlas.editor.client.StructuredSourceClient
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.service.StructuredDraftEngine
import com.constitutionatlas.editor.service.StructuredDraftService
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

@Testcontainers
@SpringBootTest(classes = [EditorServiceApplication::class])
class StructuredDraftApiTest {
    @Autowired lateinit var drafts: StructuredDraftService

    @Autowired lateinit var sessions: EditorRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @MockBean lateinit var identity: IdentityClient

    @MockBean lateinit var sources: StructuredSourceClient

    private val settings = DraftSettings(
        UUID.randomUUID(),
        DraftOutline(
            listOf(
                DraftLevel("article", true, true, listOf("sentence")),
                DraftLevel("sentence", true, false, emptyList()),
            ),
        ),
    )

    private fun fixture(): DraftNode = DraftNode(
        UUID.randomUUID(),
        UUID.randomUUID(),
        kind = "article",
        label = "46a",
        title = "Rights",
        content = listOf(
            DraftEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), text = "Before."),
            DraftEntry(
                "child",
                node = DraftNode(
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    kind = "sentence",
                    label = "(2a)",
                    content = listOf(
                        DraftEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), text = "Original wording."),
                    ),
                ),
            ),
            DraftEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), text = "After."),
        ),
    )

    @Test
    fun targetedSaveReopensLosslesslyAndPersistsOnlyOperation() {
        val actor = Actor(UUID.randomUUID(), "editor@test.local", listOf("editor"))
        val version = UUID.randomUUID()
        val root = fixture()
        val entry = root.content[1].node!!.content.single()
        val source = DraftSource(version, 7, settings.id, listOf(root))
        Mockito.`when`(identity.authenticate("Bearer test")).thenReturn(actor)
        Mockito.`when`(sources.source(version)).thenReturn(source)
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        val session = sessions.insertSession(actor.id, version, "editorial_correction")
        val operation = DraftOperation(UUID.randomUUID(), "replace_text", entry.logicalId!!, entry.revisionId!!, text = "Changed wording.")
        val saved = drafts.save("Bearer test", session, StructuredDraftSave(0, listOf(operation)))
        assertThat(saved.roots.single().content[1].node!!.content.single().text).isEqualTo("Changed wording.")
        assertThat(saved.roots.single().content.first()).isEqualTo(root.content.first())
        assertThat(drafts.preview("Bearer test", session)).isEqualTo(saved)
        val stored = jdbc.queryForObject("SELECT payload::text FROM structured_draft_operations WHERE id = ?", String::class.java, operation.id)!!
        assertThat(stored).contains("Changed wording.").doesNotContain("Before.", "After.", "Original wording.")
        assertThrows(ConflictException::class.java) { drafts.save("Bearer test", session, StructuredDraftSave(0, listOf(operation.copy(id = UUID.randomUUID())))) }
        Mockito.`when`(sources.source(version)).thenReturn(source.copy(generation = 8))
        assertThrows(ConflictException::class.java) { drafts.preview("Bearer test", session) }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM structured_draft_operations WHERE session_id = ?", Int::class.java, session)).isEqualTo(1)
    }

    @Test
    fun splitMergePreserveBytesAndCannotCrossChildBoundary() {
        val root = fixture()
        val text = root.content.first()
        val split = DraftOperation(UUID.randomUUID(), "split_text", text.logicalId!!, text.revisionId!!, parts = listOf(TextPart(UUID.randomUUID(), "Be"), TextPart(UUID.randomUUID(), "fore.")))
        val splitRoots = StructuredDraftEngine.replay(listOf(root), listOf(split), settings)
        val merge = DraftOperation(UUID.randomUUID(), "merge_text", split.parts.first().logicalId, split.id, parts = listOf(TextPart(UUID.randomUUID(), "Before.")), mergeIds = split.parts.map { it.logicalId })
        val merged = StructuredDraftEngine.replay(splitRoots, listOf(merge), settings)
        assertThat(merged.single().content.first().text).isEqualTo("Before.")
        val crossing = DraftOperation(UUID.randomUUID(), "merge_text", text.logicalId!!, text.revisionId!!, parts = listOf(TextPart(UUID.randomUUID(), "Before.After.")), mergeIds = listOf(text.logicalId!!, root.content.last().logicalId!!))
        assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(root), listOf(crossing), settings) }
    }

    @Test
    fun explicitMovePreservesOrderAndRejectsDuplicateIdentities() {
        val root = fixture()
        val first = root.content.first()
        val move = DraftOperation(UUID.randomUUID(), "move", first.logicalId!!, first.revisionId!!, position = 2, destinationParentId = root.logicalId, destinationRevisionId = root.revisionId)
        val result = StructuredDraftEngine.replay(listOf(root), listOf(move), settings).single()
        assertThat(result.content.map { it.type }).containsExactly("child", "text", "text")
        assertThat(result.content.last().text).isEqualTo("Before.")
        val duplicate = DraftOperation(UUID.randomUUID(), "insert_text", root.logicalId, root.revisionId!!, position = 0, parts = listOf(TextPart(first.logicalId!!, "Duplicate")))
        assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(root), listOf(duplicate), settings) }
    }

    companion object {
        @Container @JvmStatic
        val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

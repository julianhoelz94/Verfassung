import com.constitutionatlas.content.ContentServiceApplication
import com.constitutionatlas.content.VersionPublishedException
import com.constitutionatlas.content.api.OrderedEntryWrite
import com.constitutionatlas.content.api.OrderedNodeWrite
import com.constitutionatlas.content.api.OrderedSnapshotWrite
import com.constitutionatlas.content.client.CatalogClient
import com.constitutionatlas.content.client.CatalogVersion
import com.constitutionatlas.content.client.StructuralLevel
import com.constitutionatlas.content.client.StructuralOutline
import com.constitutionatlas.content.client.StructuralSettings
import com.constitutionatlas.content.service.OrderedContentService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.web.server.ResponseStatusException
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

@Testcontainers
@SpringBootTest(classes = [ContentServiceApplication::class], properties = ["content.ordered-mixed-writes.enabled=true"])
class OrderedContentApiTest {
    @Autowired lateinit var content: OrderedContentService

    @Autowired lateinit var articles: com.constitutionatlas.content.service.ArticleQueryService

    @Autowired lateinit var jdbc: JdbcTemplate

    @MockBean lateinit var catalog: CatalogClient

    @Test
    fun partChapterArticleRootsPreserveKindOrderAndExportIdentity() {
        val version = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
        Mockito.`when`(catalog.getSettings(version)).thenReturn(
            StructuralSettings(
                UUID.randomUUID(),
                StructuralOutline(
                    listOf(
                        StructuralLevel("part", true, true, listOf("chapter")),
                        StructuralLevel("chapter", false, true, listOf("article")),
                        StructuralLevel("article", true, false, emptyList()),
                    ),
                ),
            ),
        )
        val article = OrderedNodeWrite(kind = "article", label = "46a", title = "Rights", content = listOf(OrderedEntryWrite("text", text = "Exact  bytes.")))
        val chapter = OrderedNodeWrite(kind = "chapter", label = "bis", content = listOf(OrderedEntryWrite("child", node = article)))
        val part = OrderedNodeWrite(kind = "part", label = "I", content = listOf(OrderedEntryWrite("text", text = "Before."), OrderedEntryWrite("child", node = chapter), OrderedEntryWrite("text", text = "After.")))
        val snapshot = content.save(version, OrderedSnapshotWrite(0, roots = listOf(part)))
        val root = snapshot.roots.single()
        val summary = articles.listByVersion(version, includeBody = true).single()
        assertThat(summary.kind).isEqualTo("part")
        assertThat(articles.listUnits(version, 0, 200, true).first.single().legacyIdentity).isFalse()
        assertThat(articles.getUnit(version, root.occurrenceId).legacyIdentity).isFalse()
        assertThat(summary.logicalId).isEqualTo(root.logicalId)
        assertThat(articles.getById(root.occurrenceId).kind).isEqualTo("part")
        assertThat(content.plainText(root)).isEqualTo("Before. Exact  bytes. After.")
        val exported = content.export(version).roots.single()
        assertThat(exported.logicalId).isEqualTo(root.logicalId)
        assertThat(exported.revisionId).isNull()
        assertThat(exported.content!![1].node!!.label).isEqualTo("bis")
        assertThat(exported.content!![1].node!!.content!!.single().node!!.label).isEqualTo("46a")
        val copy = UUID.randomUUID()
        Mockito.`when`(catalog.getVersion(copy)).thenReturn(CatalogVersion(copy, "draft", constitution))
        val pinnedSettings = catalog.getSettings(version)
        Mockito.`when`(catalog.getSettings(copy)).thenReturn(pinnedSettings)
        val reopened = content.save(copy, OrderedSnapshotWrite(0, roots = listOf(exported))).roots.single()
        assertThat(reopened.logicalId).isEqualTo(root.logicalId)
        assertThat(content.plainText(reopened)).isEqualTo(content.plainText(root))
    }

    @Test
    fun publishReceiptMakesBindingRetryableAndSealsRoots() {
        val version = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        version(version, constitution)
        val attempt = UUID.randomUUID()
        val request = OrderedSnapshotWrite(0, roots = listOf(OrderedNodeWrite(kind = "article", label = "46a", content = listOf(OrderedEntryWrite("text", text = "Exact  bytes.\n")))), publishAttemptId = attempt)
        val first = content.save(version, request)
        assertThat(content.save(version, request)).isEqualTo(first)
        assertThat(content.publishReceipt(version, attempt)).isEqualTo(first)
        assertThrows(org.springframework.web.server.ResponseStatusException::class.java) { content.save(version, request.copy(expectedGeneration = first.generation, publishAttemptId = null)) }
        assertThrows(org.springframework.web.server.ResponseStatusException::class.java) { content.save(version, request.copy(roots = emptyList())) }
        Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "published", constitution))
        assertThat(content.save(version, request)).isEqualTo(first)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ordered_publish_receipts WHERE version_id = ?", Int::class.java, version)).isEqualTo(1)
    }

    @Test
    fun orderedSnapshotExposesPersistedSplitLineage() {
        val constitution = UUID.randomUUID()
        val sourceId = UUID.randomUUID()
        val targetId = UUID.randomUUID()
        version(sourceId, constitution)
        version(targetId, constitution)
        val source = content.save(sourceId, OrderedSnapshotWrite(0, roots = listOf(OrderedNodeWrite(kind = "article", label = "1", content = listOf(OrderedEntryWrite("text", text = "Before"))))))
        val root = source.roots.single()
        val original = root.content.single()
        Mockito.`when`(catalog.getVersion(sourceId)).thenReturn(CatalogVersion(sourceId, "published", constitution))
        val target = content.save(
            targetId,
            OrderedSnapshotWrite(
                0,
                sourceId,
                source.generation,
                listOf(
                    OrderedNodeWrite(
                        logicalId = root.logicalId,
                        predecessorRevisionId = root.revisionId,
                        kind = "article",
                        label = "1",
                        content = listOf(
                            OrderedEntryWrite("text", logicalId = UUID.randomUUID(), text = "Be", lineage = listOf(original.revisionId!!)),
                            OrderedEntryWrite("text", logicalId = UUID.randomUUID(), text = "fore", lineage = listOf(original.revisionId!!)),
                        ),
                    ),
                ),
            ),
        )
        assertThat(target.roots.single().content.map { it.lineage }).containsExactly(listOf(original.revisionId!!), listOf(original.revisionId!!))
        assertThat(content.get(targetId).roots.single().content.map { it.lineage }).containsExactly(listOf(original.revisionId!!), listOf(original.revisionId!!))
    }

    @Test
    fun orderedSnapshotAndArticleApiExposeNodeSplitLineage() {
        val constitution = UUID.randomUUID()
        val sourceId = UUID.randomUUID()
        val targetId = UUID.randomUUID()
        version(sourceId, constitution)
        version(targetId, constitution)
        val source = content.save(sourceId, OrderedSnapshotWrite(0, roots = listOf(OrderedNodeWrite(kind = "article", label = "1", content = emptyList()))))
        val original = source.roots.single()
        Mockito.`when`(catalog.getVersion(sourceId)).thenReturn(CatalogVersion(sourceId, "published", constitution))
        val target = content.save(
            targetId,
            OrderedSnapshotWrite(
                0,
                sourceId,
                source.generation,
                listOf(
                    OrderedNodeWrite(kind = "article", label = "1a", content = emptyList(), lineage = listOf(original.revisionId)),
                    OrderedNodeWrite(kind = "article", label = "1b", content = emptyList(), lineage = listOf(original.revisionId)),
                ),
            ),
        )
        assertThat(target.roots.map { it.lineage }).containsExactly(listOf(original.revisionId), listOf(original.revisionId))
        assertThat(articles.listUnits(targetId, 0, 10, true).first.map { it.lineage }).containsExactly(listOf(original.revisionId), listOf(original.revisionId))
        assertThat(articles.getUnit(targetId, target.roots.first().occurrenceId).lineage).containsExactly(original.revisionId)
    }

    private fun version(id: UUID, constitution: UUID, parentText: Boolean = true) {
        Mockito.`when`(catalog.getVersion(id)).thenReturn(CatalogVersion(id, "draft", constitution))
        Mockito.`when`(catalog.getSettings(id)).thenReturn(
            StructuralSettings(
                UUID.randomUUID(),
                StructuralOutline(
                    listOf(
                        StructuralLevel("article", parentText, true, listOf("sentence")),
                        StructuralLevel("sentence", true, false, emptyList()),
                    ),
                ),
            ),
        )
    }

    private fun initial(version: UUID) = content.save(
        version,
        OrderedSnapshotWrite(
            content.get(version).generation,
            roots = listOf(
                OrderedNodeWrite(
                    kind = "article",
                    label = "46a",
                    title = "Rights",
                    content = listOf(
                        OrderedEntryWrite("text", text = "Before."),
                        OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "sentence", label = "bis", content = listOf(OrderedEntryWrite("text", text = "First.")))),
                        OrderedEntryWrite("text", text = "Between."),
                        OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "sentence", label = "(2a)", content = listOf(OrderedEntryWrite("text", text = "Second.")))),
                        OrderedEntryWrite("text", text = "After."),
                    ),
                ),
            ),
        ),
    )

    @Test
    fun oneSentenceEditSharesUntouchedRevisionAndPreservesOldSnapshot() {
        val constitution = UUID.randomUUID()
        val sourceId = UUID.randomUUID()
        val targetId = UUID.randomUUID()
        version(sourceId, constitution)
        version(targetId, constitution)
        val source = initial(sourceId)
        val root = source.roots.single()
        val first = root.content[1].node!!
        val text = first.content.single()
        val nodesBefore = count("content_node_revisions")
        val textsBefore = count("content_text_revisions")
        Mockito.`when`(catalog.getVersion(sourceId)).thenReturn(CatalogVersion(sourceId, "published", constitution))
        val target = content.save(
            targetId,
            OrderedSnapshotWrite(
                content.get(targetId).generation,
                sourceId,
                source.generation,
                listOf(
                    OrderedNodeWrite(
                        logicalId = root.logicalId,
                        predecessorRevisionId = root.revisionId,
                        kind = root.kind,
                        label = root.label,
                        title = root.title,
                        content = root.content.mapIndexed { index, entry ->
                            if (index == 1) {
                                OrderedEntryWrite(
                                    "child",
                                    node = OrderedNodeWrite(
                                        logicalId = first.logicalId,
                                        predecessorRevisionId = first.revisionId,
                                        kind = first.kind,
                                        label = first.label,
                                        content = listOf(OrderedEntryWrite("text", logicalId = text.logicalId, predecessorRevisionId = text.revisionId, text = "Changed.")),
                                    ),
                                )
                            } else if (entry.node != null) {
                                OrderedEntryWrite("child", node = OrderedNodeWrite(revisionId = entry.node!!.revisionId))
                            } else {
                                OrderedEntryWrite("text", revisionId = entry.revisionId)
                            }
                        },
                    ),
                ),
            ),
        )
        val compatibility = articles.getById(target.roots.single().occurrenceId)
        assertThat(compatibility.predecessorId).isEqualTo(root.occurrenceId)
        assertThat(compatibility.children.first().predecessorId).isEqualTo(first.occurrenceId)
        assertThat(compatibility.children[1].predecessorId).isEqualTo(root.content[3].node!!.occurrenceId)
        val branchId = UUID.randomUUID()
        version(branchId, constitution)
        val branch = content.save(branchId, OrderedSnapshotWrite(content.get(branchId).generation, targetId, target.generation, listOf(OrderedNodeWrite(revisionId = target.roots.single().revisionId))))
        val branchArticle = articles.getById(branch.roots.single().occurrenceId)
        assertThat(branchArticle.predecessorId).isEqualTo(target.roots.single().occurrenceId)
        assertThat(branchArticle.children[1].predecessorId).isEqualTo(target.roots.single().content[3].node!!.occurrenceId)
        assertThat(articles.listByVersion(targetId, includeBody = true).single().predecessorId).isEqualTo(root.occurrenceId)
        assertThat(count("content_node_revisions") - nodesBefore).isEqualTo(2)
        assertThat(count("content_text_revisions") - textsBefore).isEqualTo(1)
        assertThat(target.roots.single().content[3].node!!.revisionId).isEqualTo(root.content[3].node!!.revisionId)
        assertThat(content.plainText(content.get(sourceId).roots.single())).isEqualTo("Before. First. Between. Second. After.")
        assertThat(content.plainText(target.roots.single())).isEqualTo("Before. Changed. Between. Second. After.")
        val resolved = content.resolve(targetId, text.logicalId!!)
        assertThat(resolved.text).isEqualTo("Changed.")
        assertThat(resolved.breadcrumbs).containsExactly(root.logicalId, first.logicalId)
        assertThat(content.resolve(sourceId, text.logicalId!!).text).isEqualTo("First.")
        assertThrows(VersionPublishedException::class.java) { content.save(sourceId, OrderedSnapshotWrite(source.generation, roots = emptyList())) }
        assertThrows(DataAccessException::class.java) { jdbc.update("UPDATE content_text_revisions SET text = 'mutated' WHERE id = ?", text.revisionId) }
        assertThrows(DataAccessException::class.java) { jdbc.update("INSERT INTO content_revision_entries(parent_revision_id, position, text_revision_id) VALUES (?, 99, ?)", root.revisionId, text.revisionId) }
    }

    @Test
    fun invalidParentTextAndCrossConstitutionReferenceRollBack() {
        val sourceId = UUID.randomUUID()
        val targetId = UUID.randomUUID()
        version(sourceId, UUID.randomUUID())
        version(targetId, UUID.randomUUID(), parentText = false)
        val source = initial(sourceId)
        val generation = content.get(targetId).generation
        assertThrows(IllegalArgumentException::class.java) { content.save(targetId, OrderedSnapshotWrite(generation, sourceId, source.generation, listOf(OrderedNodeWrite(revisionId = source.roots.single().revisionId)))) }
        val before = count("content_node_revisions")
        assertThrows(IllegalArgumentException::class.java) { content.save(targetId, OrderedSnapshotWrite(generation, roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", text = "Forbidden parent text")))))) }
        assertThat(count("content_node_revisions")).isEqualTo(before)
        assertThat(content.get(targetId).generation).isEqualTo(generation)
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = [5, 250])
    fun revisionGrowthDependsOnChangedPathRatherThanTreeSize(size: Int) {
        val constitution = UUID.randomUUID()
        val sourceId = UUID.randomUUID()
        val targetId = UUID.randomUUID()
        version(sourceId, constitution)
        version(targetId, constitution)
        val source = content.save(sourceId, OrderedSnapshotWrite(0, roots = listOf(OrderedNodeWrite(kind = "article", label = "46a", content = (0 until size).map { index -> OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "sentence", label = "($index)", content = listOf(OrderedEntryWrite("text", text = "Sentence $index.")))) }))))
        val root = source.roots.single()
        val sentence = root.content.first().node!!
        val text = sentence.content.single()
        val nodeCount = count("content_node_revisions")
        val textCount = count("content_text_revisions")
        Mockito.`when`(catalog.getVersion(sourceId)).thenReturn(CatalogVersion(sourceId, "published", constitution))
        val target = content.save(
            targetId,
            OrderedSnapshotWrite(
                0,
                sourceId,
                source.generation,
                listOf(
                    OrderedNodeWrite(
                        logicalId = root.logicalId,
                        predecessorRevisionId = root.revisionId,
                        kind = root.kind,
                        label = root.label,
                        content = root.content.mapIndexed { index, entry ->
                            if (index == 0) OrderedEntryWrite("child", node = OrderedNodeWrite(logicalId = sentence.logicalId, predecessorRevisionId = sentence.revisionId, kind = sentence.kind, label = sentence.label, content = listOf(OrderedEntryWrite("text", logicalId = text.logicalId, predecessorRevisionId = text.revisionId, text = "Changed wording.")))) else OrderedEntryWrite("child", node = OrderedNodeWrite(revisionId = entry.node!!.revisionId))
                        },
                    ),
                ),
            ),
        )
        assertThat(count("content_node_revisions") - nodeCount).isEqualTo(2)
        assertThat(count("content_text_revisions") - textCount).isEqualTo(1)
        assertThat(target.roots.single().content.drop(1).map { it.node!!.revisionId }).isEqualTo(root.content.drop(1).map { it.node!!.revisionId })
        assertThat(content.resolve(sourceId, text.logicalId!!).text).isEqualTo("Sentence 0.")
        assertThat(content.resolve(targetId, text.logicalId!!).text).isEqualTo("Changed wording.")
        assertThrows(ResponseStatusException::class.java) { content.save(targetId, OrderedSnapshotWrite(target.generation, sourceId, source.generation + 1, listOf(OrderedNodeWrite(revisionId = root.revisionId)))) }
    }

    private fun count(table: String): Int = jdbc.queryForObject("SELECT COUNT(*) FROM $table", Int::class.java)!!

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

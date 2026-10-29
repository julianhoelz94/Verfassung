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
import com.constitutionatlas.platform.OrderedInlineReference
import com.constitutionatlas.platform.OrderedReferenceTarget
import com.constitutionatlas.platform.OrderedTable
import com.constitutionatlas.platform.OrderedTableCell
import com.constitutionatlas.platform.OrderedTableRow
import com.constitutionatlas.platform.OrderedTextMark
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.web.server.ResponseStatusException
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import java.util.UUID

@Testcontainers
@SpringBootTest(classes = [ContentServiceApplication::class], properties = ["content.ordered-mixed-writes.enabled=true"])
class OrderedContentApiTest {
    @Autowired lateinit var content: OrderedContentService

    @Autowired lateinit var articles: com.constitutionatlas.content.service.ArticleQueryService

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var orderedRepository: com.constitutionatlas.content.repo.OrderedContentRepository

    @Autowired lateinit var receipts: com.constitutionatlas.content.repo.OrderedPublishReceiptRepository

    @MockitoBean lateinit var catalog: CatalogClient

    @Test
    fun invalidEndnotesAndMarksRollBackTheWholeSnapshotIncludingNewRevisions() {
        val version = UUID.randomUUID()
        Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", UUID.randomUUID()))
        Mockito.`when`(catalog.getSettings(version)).thenReturn(StructuralSettings(UUID.randomUUID(), StructuralOutline(listOf(StructuralLevel("article", true, false, emptyList(), root = true)))))
        val empty = content.get(version)
        val nodesBefore = jdbc.queryForObject("SELECT COUNT(*) FROM content_node_revisions", Int::class.java)
        val note = OrderedEntryWrite("text", text = "Note", format = "footnote")
        val later = OrderedNodeWrite(logicalId = UUID.randomUUID(), kind = "article", content = listOf(OrderedEntryWrite("text", text = "Later body")))
        val misplaced = listOf(OrderedNodeWrite(kind = "article", content = listOf(note)), later)
        val placement = assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = misplaced)) }
        assertThat(placement.body()["code"]).isEqualTo("FOOTNOTE_NOT_AT_END")
        assertThat(placement.body()["logicalId"]).isEqualTo(later.logicalId.toString())
        val malformed = later.copy(content = listOf(OrderedEntryWrite("text", text = "Law", marks = listOf(OrderedTextMark("bold", 0, 4)))))
        assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = listOf(malformed))) }
        for (count in listOf(-1, 17)) {
            val invalidLayout = later.copy(content = listOf(OrderedEntryWrite("text", text = "Law", lineBreaksBefore = count)))
            val layoutError = assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = listOf(invalidLayout))) }
            assertThat(layoutError.errors.single().code).isEqualTo("TEXT_LINE_BREAKS")
        }
        val dangling = later.copy(content = listOf(OrderedEntryWrite("text", text = "Law", references = listOf(OrderedInlineReference(UUID.randomUUID(), 0, 3, OrderedReferenceTarget("unit", logicalId = UUID.randomUUID()))))))
        val target = assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { content.save(version, OrderedSnapshotWrite(0, roots = listOf(dangling))) }
        assertThat(target.errors.single().code).isEqualTo("UNIT_REFERENCE_TARGET")
        assertThat(content.get(version)).isEqualTo(empty)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_node_revisions", Int::class.java)).isEqualTo(nodesBefore)
    }

    @Test
    fun historicalMisplacedNotesRemainReadableButCannotBeReusedOrSealed() {
        val source = UUID.randomUUID()
        val target = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val settings = StructuralSettings(UUID.randomUUID(), StructuralOutline(listOf(StructuralLevel("article", true, false, emptyList(), root = true))))
        for (version in listOf(source, target)) {
            Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, if (version == source) "published" else "draft", constitution))
            Mockito.`when`(catalog.getSettings(version)).thenReturn(settings)
        }
        // An immutable snapshot authored before the invariant was introduced.
        orderedRepository.lock(source)
        val rootRevision = UUID.randomUUID()
        orderedRepository.insertNode(rootRevision, UUID.randomUUID(), source, null, "article", null, null)
        for ((position, format) in listOf("footnote", "plain").withIndex()) {
            val revision = UUID.randomUUID()
            orderedRepository.insertText(revision, UUID.randomUUID(), source, null, if (format == "footnote") "Historical note" else "Historical body", emptyList(), format)
            orderedRepository.insertEntry(rootRevision, position, revision, null)
        }
        orderedRepository.seal(rootRevision)
        orderedRepository.bind(source, constitution, settings.id)
        orderedRepository.replaceRoots(source, listOf(rootRevision))
        val historical = content.get(source)
        assertThat(historical.roots.single().content).hasSize(2)
        val request = OrderedSnapshotWrite(0, sourceVersionId = source, sourceGeneration = historical.generation, roots = listOf(OrderedNodeWrite(revisionId = rootRevision)))
        assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { content.save(target, request) }
        assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { content.sealImport(source, UUID.randomUUID(), historical.generation, settings.id) }
        assertThat(content.get(source)).isEqualTo(historical)
        assertThat(content.get(target).roots).isEmpty()
    }

    @Test
    fun completeWritesRejectOrphanNotesAtomicallyAndAcceptManyMarkersAcrossRoots() {
        val constitution = UUID.randomUUID()
        val settings = StructuralSettings(UUID.randomUUID(), StructuralOutline(listOf(StructuralLevel("article", true, false, emptyList(), root = true))))
        val noteId = UUID.randomUUID()
        val note = OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", logicalId = noteId, text = "Shared note", format = "footnote")))
        for (count in 0..3) {
            val version = UUID.randomUUID()
            Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
            Mockito.`when`(catalog.getSettings(version)).thenReturn(settings)
            val original = content.get(version)
            val before = jdbc.queryForObject("SELECT COUNT(*) FROM content_text_revisions", Int::class.java)
            val bodies = List(count) { OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", text = "Body", references = listOf(OrderedInlineReference(UUID.randomUUID(), 4, 4, OrderedReferenceTarget("footnote", footnoteId = noteId)))))) }
            val request = OrderedSnapshotWrite(0, roots = bodies + note)
            if (count == 0) {
                val error = assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { content.save(version, request) }.errors.single()
                assertThat(error.code).isEqualTo("FOOTNOTE_MARK_CARDINALITY")
                assertThat(error.path).isEqualTo("roots[0].content[0]")
                assertThat(error.logicalId).isEqualTo(noteId)
                assertThat(content.get(version)).isEqualTo(original)
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_text_revisions", Int::class.java)).isEqualTo(before)
            } else {
                val saved = content.save(version, request)
                assertThat(saved.roots.dropLast(1).flatMap { it.content }.flatMap { it.references }).hasSize(count)
                assertThat(content.sealImport(version, UUID.randomUUID(), saved.generation, settings.id)).isEqualTo(saved)
            }
        }
    }

    @Test
    fun duplicateCrossRootReferenceIdentitiesRejectTheCompleteWriteAtomically() {
        val version = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val settings = StructuralSettings(UUID.randomUUID(), StructuralOutline(listOf(StructuralLevel("article", true, false, emptyList(), root = true))))
        Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
        Mockito.`when`(catalog.getSettings(version)).thenReturn(settings)
        val noteId = UUID.randomUUID()
        val reference = OrderedInlineReference(UUID.randomUUID(), 4, 4, OrderedReferenceTarget("footnote", footnoteId = noteId))
        val secondId = UUID.randomUUID()
        val bodies = listOf(OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", text = "Body", references = listOf(reference)))), OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", logicalId = secondId, text = "Body", references = listOf(reference)))))
        val note = OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", logicalId = noteId, text = "Note", format = "footnote")))
        val original = content.get(version)
        val before = jdbc.queryForObject("SELECT COUNT(*) FROM content_text_revisions", Int::class.java)
        val request = OrderedSnapshotWrite(0, roots = bodies + note)
        val error = assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { content.save(version, request) }.errors.single()
        assertThat(error.code).isEqualTo("INLINE_REFERENCE")
        assertThat(error.path).isEqualTo("roots[1].content[0].references[0]")
        assertThat(error.logicalId).isEqualTo(secondId)
        assertThat(content.get(version)).isEqualTo(original)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM content_text_revisions", Int::class.java)).isEqualTo(before)
        val distinct = bodies.last().copy(content = listOf(bodies.last().content!!.single().copy(references = listOf(reference.copy(logicalId = UUID.randomUUID())))))
        assertThat(content.save(version, request.copy(roots = listOf(bodies.first(), distinct, note))).roots).hasSize(3)
    }

    @Test
    fun historicalOrphanNotesStayReadableButCannotBypassReuseSealOrReceiptRetries() {
        val source = UUID.randomUUID()
        val target = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val settings = StructuralSettings(UUID.randomUUID(), StructuralOutline(listOf(StructuralLevel("article", true, false, emptyList(), root = true))))
        for (version in listOf(source, target)) {
            Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
            Mockito.`when`(catalog.getSettings(version)).thenReturn(settings)
        }
        orderedRepository.lock(source)
        val root = UUID.randomUUID()
        val note = UUID.randomUUID()
        orderedRepository.insertNode(root, UUID.randomUUID(), source, null, "article", null, null)
        val text = UUID.randomUUID()
        orderedRepository.insertText(text, note, source, null, "Historical orphan", emptyList(), "footnote")
        orderedRepository.insertEntry(root, 0, text, null)
        orderedRepository.seal(root)
        orderedRepository.bind(source, constitution, settings.id)
        orderedRepository.replaceRoots(source, listOf(root))
        val historical = content.get(source)
        val targetBefore = content.get(target)
        val clone = OrderedSnapshotWrite(0, sourceVersionId = source, sourceGeneration = historical.generation, roots = listOf(OrderedNodeWrite(revisionId = root)))
        fun rejected(action: () -> Unit) {
            val error = assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { action() }.errors.single()
            assertThat(error.code).isEqualTo("FOOTNOTE_MARK_CARDINALITY")
            assertThat(error.logicalId).isEqualTo(note)
        }
        rejected { content.save(target, clone) }
        rejected { content.sealImport(source, UUID.randomUUID(), historical.generation, settings.id) }
        val attempt = UUID.randomUUID()
        val retry = OrderedSnapshotWrite(historical.generation, roots = listOf(OrderedNodeWrite(revisionId = root)), publishAttemptId = attempt)
        receipts.insert(attempt, source, com.constitutionatlas.platform.OrderedWriteFingerprint.current(retry), historical.generation)
        rejected { content.save(source, retry) }
        rejected { content.publishReceipt(source, attempt) }
        assertThat(content.get(source)).isEqualTo(historical)
        assertThat(content.get(target)).isEqualTo(targetBefore)
    }

    @Test
    fun importPublicationSealsOnlyTheApprovedGenerationAndReservationWithoutRewritingRoots() {
        val version = UUID.randomUUID()
        val attempt = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val settings = UUID.randomUUID()
        Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
        Mockito.`when`(catalog.getSettings(version)).thenReturn(StructuralSettings(settings, StructuralOutline(listOf(StructuralLevel("article", true, false, emptyList(), root = true)))))
        val prepared = content.save(version, OrderedSnapshotWrite(0, roots = listOf(OrderedNodeWrite(kind = "article", label = "1", content = listOf(OrderedEntryWrite("text", text = "Exact approved text"))))))
        assertThrows(ResponseStatusException::class.java) { content.sealImport(version, attempt, prepared.generation + 1, settings) }
        assertThrows(ResponseStatusException::class.java) { content.sealImport(version, attempt, prepared.generation, UUID.randomUUID()) }
        assertThat(content.sealImport(version, attempt, prepared.generation, settings)).isEqualTo(prepared)
        assertThat(content.sealImport(version, attempt, prepared.generation, settings)).isEqualTo(prepared)
        assertThat(content.publishReceipt(version, attempt)).isEqualTo(prepared)
        assertThrows(ResponseStatusException::class.java) { content.save(version, OrderedSnapshotWrite(prepared.generation, roots = emptyList())) }
        Mockito.doThrow(com.constitutionatlas.platform.ForbiddenException("Not the held import")).`when`(catalog).requireImportReservation(version, attempt)
        assertThrows(com.constitutionatlas.platform.ForbiddenException::class.java) { content.sealImport(version, attempt, prepared.generation, settings) }
    }

    @Test
    fun sealingLegacyContentRejectsEveryLaterLegacyRewriteWithoutChangingTheReceipt() {
        val version = UUID.randomUUID()
        val settings = UUID.randomUUID()
        Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", UUID.randomUUID()))
        Mockito.`when`(catalog.getSettings(version)).thenReturn(StructuralSettings(settings, StructuralOutline(listOf(StructuralLevel("article", true, false, emptyList(), root = true)))))
        articles.replaceForVersion(version, listOf(com.constitutionatlas.content.api.ArticleWrite(articleNumber = "1", title = "Title", body = "Approved legacy wording", sortOrder = 1)))
        val original = content.get(version)
        val attempt = UUID.randomUUID()
        content.sealImport(version, attempt, original.generation, settings)
        assertThrows(ResponseStatusException::class.java) { articles.replaceForVersion(version, emptyList()) }
        assertThrows(ResponseStatusException::class.java) { articles.updateText(original.roots.single().occurrenceId, "Title", "Changed") }
        assertThat(content.publishReceipt(version, attempt)).isEqualTo(original)
    }

    @Test
    fun authoredLineBreaksPersistExportAndCloneWithoutEnteringTextOrOffsets() {
        val source = UUID.randomUUID()
        val target = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val settings = StructuralSettings(UUID.randomUUID(), StructuralOutline(listOf(StructuralLevel("article", true, false, emptyList(), root = true))))
        for (version in listOf(source, target)) {
            Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
            Mockito.`when`(catalog.getSettings(version)).thenReturn(settings)
        }
        val marks = listOf(OrderedTextMark("bold", 0, 4))
        val saved = content.save(source, OrderedSnapshotWrite(0, roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", text = "One."), OrderedEntryWrite("text", text = "Two.", marks = marks, lineBreaksBefore = 2))))))
        val entries = content.get(source).roots.single().content
        assertThat(entries.map { it.text }).containsExactly("One.", "Two.")
        assertThat(entries.map { it.lineBreaksBefore }).containsExactly(0, 2)
        assertThat(entries.last().marks).isEqualTo(marks)
        assertThat(com.constitutionatlas.platform.OrderedContentText.entries(entries)).isEqualTo("One.\n\nTwo.")
        val exported = content.export(source)
        assertThat(exported.roots.single().content!!.last().lineBreaksBefore).isEqualTo(2)
        assertThat(com.constitutionatlas.platform.OrderedContentFidelity.matches(exported.roots, saved.roots)).isTrue()
        val cloned = content.save(target, OrderedSnapshotWrite(0, sourceVersionId = source, sourceGeneration = saved.generation, roots = listOf(OrderedNodeWrite(revisionId = saved.roots.single().revisionId))))
        assertThat(cloned.roots.single().content.last().lineBreaksBefore).isEqualTo(2)
        assertThat(cloned.roots.single().content.last().revisionId).isEqualTo(entries.last().revisionId)
        assertThat(content.get(source)).isEqualTo(saved)
    }

    @Test
    fun richEntriesPersistAndExportWithExplicitTargets() {
        val version = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
        Mockito.`when`(catalog.getSettings(version)).thenReturn(
            StructuralSettings(
                UUID.randomUUID(),
                StructuralOutline(
                    listOf(
                        StructuralLevel("article", true, false, emptyList(), root = true),
                        StructuralLevel("appendix", true, false, emptyList(), root = true),
                    ),
                ),
            ),
        )
        val articleId = UUID.randomUUID()
        val annotation = com.constitutionatlas.platform.OrderedAnnotation("editorial", "Archive editor", "https://example.org/source", listOf(articleId))
        val noteId = UUID.randomUUID()
        val appendixId = UUID.randomUUID()
        val headingId = UUID.randomUUID()
        val table = OrderedTable(
            "Schedule",
            listOf(
                OrderedTableRow(UUID.randomUUID(), listOf(OrderedTableCell(headingId, "Duty", header = true))),
                OrderedTableRow(UUID.randomUUID(), listOf(OrderedTableCell(UUID.randomUUID(), "Report", headers = listOf(headingId)))),
            ),
        )
        val roots = listOf(
            OrderedNodeWrite(
                logicalId = articleId,
                kind = "article",
                content = listOf(
                    OrderedEntryWrite(
                        "text",
                        text = "See note and unit.",
                        marks = listOf(OrderedTextMark("bold", 0, 3), OrderedTextMark("italic", 0, 8)),
                        references = listOf(
                            OrderedInlineReference(UUID.randomUUID(), 4, 8, OrderedReferenceTarget("footnote", footnoteId = noteId)),
                            OrderedInlineReference(UUID.randomUUID(), 13, 17, OrderedReferenceTarget("unit", logicalId = appendixId)),
                        ),
                    ),
                ),
            ),
            OrderedNodeWrite(logicalId = appendixId, kind = "appendix", content = listOf(OrderedEntryWrite("text", format = "table", table = table), OrderedEntryWrite("text", logicalId = noteId, text = "Source note.", format = "footnote", footnoteLabel = "1", annotation = annotation))),
        )
        val saved = content.save(version, OrderedSnapshotWrite(0, roots = roots))
        assertThat(saved.roots[0].content[0].references.first().target.footnoteId).isEqualTo(noteId)
        assertThat(content.get(version).roots[0].content[0].marks).containsExactly(OrderedTextMark("bold", 0, 3), OrderedTextMark("italic", 0, 8))
        assertThat(content.export(version).roots[0].content!![0].marks).isEqualTo(saved.roots[0].content[0].marks)
        assertThat(saved.roots[0].content[0].references.last().target.logicalId).isEqualTo(appendixId)
        assertThat(saved.roots[1].content.first().text).isEqualTo("Duty\nReport")
        assertThat(content.get(version).roots[1].content[1].annotation).isEqualTo(annotation)
        assertThat(content.export(version).roots[1].content!![1].annotation).isEqualTo(annotation)
        assertThat(content.get(version).roots[1].content.first().table).isEqualTo(table)
        assertThat(content.export(version).roots[1].content!!.first().table).isEqualTo(table)
    }

    @Test
    fun mixedRootKindsAndSkippedLevelsKeepTheirOrder() {
        val version = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        Mockito.`when`(catalog.getVersion(version)).thenReturn(CatalogVersion(version, "draft", constitution))
        Mockito.`when`(catalog.getSettings(version)).thenReturn(
            StructuralSettings(
                UUID.randomUUID(),
                StructuralOutline(
                    listOf(
                        StructuralLevel("article", false, true, listOf("paragraph"), root = true),
                        StructuralLevel("paragraph", true, false, emptyList()),
                        StructuralLevel("preamble", true, false, emptyList(), root = true),
                        StructuralLevel("appendix", true, false, emptyList(), root = true),
                    ),
                ),
            ),
        )
        val roots = listOf(
            OrderedNodeWrite(kind = "preamble", title = "Purpose", content = listOf(OrderedEntryWrite("text", text = "We the people."))),
            OrderedNodeWrite(kind = "article", label = "1", content = listOf(OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "paragraph", content = listOf(OrderedEntryWrite("text", text = "A right.")))))),
            OrderedNodeWrite(kind = "appendix", content = listOf(OrderedEntryWrite("text", text = "Unnumbered schedule."))),
        )
        val snapshot = content.save(version, OrderedSnapshotWrite(0, roots = roots))
        assertThat(snapshot.roots.map { it.kind }).containsExactly("preamble", "article", "appendix")
        assertThat(snapshot.roots.last().title).isNull()
        assertThat(content.export(version).roots.map { it.kind }).containsExactly("preamble", "article", "appendix")
    }

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
        assertThat(content.export(targetId).roots.single().content!!.map { it.lineage }).containsExactly(listOf(original.revisionId!!), listOf(original.revisionId!!))
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
        assertThat(content.export(targetId).roots.map { it.lineage }).containsExactly(listOf(original.revisionId), listOf(original.revisionId))
    }

    @Test
    fun articleAliasesAndNestedCompatibilityNodesPreserveSiblingOrder() {
        val versionId = UUID.randomUUID()
        version(versionId, UUID.randomUUID())
        val first = initial(versionId)
        val snapshot = content.save(
            versionId,
            OrderedSnapshotWrite(
                first.generation,
                roots = listOf(
                    OrderedNodeWrite(kind = "article", label = "0", content = emptyList()),
                    OrderedNodeWrite(revisionId = first.roots.single().revisionId),
                ),
            ),
        )
        val root = snapshot.roots[1]
        val detail = articles.getById(root.occurrenceId)
        assertThat(detail).isEqualTo(articles.getUnit(versionId, root.occurrenceId))
        assertThat(detail.sortOrder).isEqualTo(2)
        assertThat(detail.children.map { it.sortOrder }).containsExactly(1, 2)
        val articleList = articles.listByVersion(versionId, offset = 1, limit = 1, includeBody = true).single()
        val unitList = articles.listUnits(versionId, 1, 1, true).first.single()
        assertThat(articleList.sortOrder).isEqualTo(2)
        assertThat(articleList.children).isEqualTo(detail.children)
        assertThat(unitList.children).isEqualTo(detail.children)
        assertThat(unitList.sortOrder).isEqualTo(2)
    }

    @Test
    fun childEntriesRejectTextFormattingInsteadOfSilentlyDiscardingIt() {
        val versionId = UUID.randomUUID()
        version(versionId, UUID.randomUUID())
        val child = OrderedEntryWrite("child", node = OrderedNodeWrite(kind = "sentence", content = emptyList()))
        val invalid = listOf(
            child.copy(format = "footnote"),
            child.copy(footnoteLabel = "1"),
            child.copy(table = OrderedTable(rows = emptyList())),
            child.copy(references = listOf(OrderedInlineReference(UUID.randomUUID(), 0, 1, OrderedReferenceTarget("external", url = "https://example.com")))),
        )
        invalid.forEach { entry ->
            assertThrows(IllegalArgumentException::class.java) {
                content.save(versionId, OrderedSnapshotWrite(0, roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(entry)))))
            }
        }
        assertThat(content.get(versionId).generation).isZero()
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
        val postgres = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

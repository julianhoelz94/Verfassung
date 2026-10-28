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
import com.constitutionatlas.editor.service.DiffReviewDecisionWrite
import com.constitutionatlas.editor.service.StructuredDiffReviewService
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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import java.util.UUID

@Testcontainers
@SpringBootTest(classes = [EditorServiceApplication::class])
class StructuredDraftApiTest {
    @Autowired lateinit var drafts: StructuredDraftService

    @Autowired lateinit var diffReview: StructuredDiffReviewService

    @Autowired lateinit var amendmentActions: com.constitutionatlas.editor.service.AmendmentActions

    @Autowired lateinit var sessions: EditorRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @MockitoBean lateinit var identity: IdentityClient

    @Autowired lateinit var editorService: com.constitutionatlas.editor.service.EditorService

    @MockitoBean lateinit var publishClient: com.constitutionatlas.editor.client.OrderedPublishClient

    @MockitoBean lateinit var catalogClient: com.constitutionatlas.editor.client.CatalogClient

    @MockitoBean lateinit var contentClient: com.constitutionatlas.editor.client.ContentClient

    @MockitoBean lateinit var amendmentClient: com.constitutionatlas.editor.client.AmendmentClient

    @MockitoBean lateinit var auditClient: com.constitutionatlas.editor.client.AuditClient

    @MockitoBean lateinit var searchClient: com.constitutionatlas.editor.client.SearchIndexClient

    @MockitoBean lateinit var sources: StructuredSourceClient

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
    fun sourceEvidenceRevisionHistoryAndDecisionsArePinnedAndImmutable() {
        val owner = Actor(UUID.randomUUID(), "sources@test.local", listOf("editor", "reviewer"))
        val reviewer = Actor(UUID.randomUUID(), "review@test.local", listOf("reviewer"))
        val other = Actor(UUID.randomUUID(), "other@test.local", listOf("editor"))
        Mockito.`when`(identity.authenticate("owner")).thenReturn(owner)
        Mockito.`when`(identity.authenticate("reviewer")).thenReturn(reviewer)
        Mockito.`when`(identity.authenticate("other")).thenReturn(other)
        val version = UUID.randomUUID()
        val original = com.constitutionatlas.platform.SourceEvidence(coverage = "Articles 1–10", attribution = "Original archive")
        val source = com.constitutionatlas.editor.client.CatalogVersion(version, UUID.randomUUID(), "2025", "published", currentVersionId = version, sourceEvidence = original)
        Mockito.`when`(catalogClient.getVersion(version)).thenReturn(source)
        Mockito.`when`(sources.source(version)).thenReturn(DraftSource(version, 7, settings.id, listOf(fixture())))
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        val session = sessions.insertSession(owner.id, version, "editorial_correction")
        val save = com.constitutionatlas.editor.api.SaveSourceEvidenceRequest(0, original.copy(attribution = "Corrected archive"), "Correct attribution")
        assertThrows(com.constitutionatlas.platform.ForbiddenException::class.java) { editorService.saveSourceEvidence("other", session, save) }
        assertThrows(IllegalArgumentException::class.java) { editorService.saveSourceEvidence("owner", session, save.copy(reason = " ")) }
        assertThrows(IllegalArgumentException::class.java) { editorService.saveSourceEvidence("owner", session, save.copy(evidence = save.evidence.copy(datePrecision = "day"))) }
        val saved = editorService.saveSourceEvidence("owner", session, save)
        assertThat(saved.sourceEvidenceRevisions.single().original).isEqualTo(original)
        assertThat(saved.sourceEvidenceRevisions.single().actorId).isEqualTo(owner.id)
        assertThat(saved.sourceEvidenceRevisions.single().createdAt).isNotNull()
        assertThat(saved.session.revisionCount).isEqualTo(1)
        assertThat(catalogClient.getVersion(version).sourceEvidence).isEqualTo(original)
        val stale = assertThrows(ConflictException::class.java) { editorService.saveSourceEvidence("owner", session, save) }
        assertThat(stale.code).isEqualTo("stale_source_evidence")
        editorService.submitReview("owner", session, 1)
        assertThrows(ConflictException::class.java) { editorService.saveSourceEvidence("owner", session, save.copy(expectedRevision = 1)) }
        assertThrows(com.constitutionatlas.platform.ForbiddenException::class.java) { editorService.approve("owner", session, 1) }
        editorService.requestSourceEvidenceChanges("reviewer", session, com.constitutionatlas.editor.api.SourceEvidenceChangesRequest(1, "Clarify coverage"))
        assertThrows(ConflictException::class.java) { editorService.submitReview("owner", session, 1) }
        editorService.saveSourceEvidence("owner", session, save.copy(expectedRevision = 1, evidence = save.evidence.copy(coverage = "Complete articles 1–10"), reason = "Clarify the excerpt"))
        editorService.submitReview("owner", session, 2)
        assertThrows(ConflictException::class.java) { editorService.approve("reviewer", session, 1) }
        val approved = editorService.approve("reviewer", session, 2)
        assertThat(approved.sourceEvidenceRevisions.map { it.revision }).containsExactly(2, 1)
        assertThat(approved.sourceEvidenceDecisions.map { it.action }).containsExactly("review_submitted", "changes_requested", "review_submitted", "review_approved")
        assertThat(approved.sourceEvidenceDecisions.last().actorId).isEqualTo(reviewer.id)
        assertThrows(org.springframework.dao.DataAccessException::class.java) { jdbc.update("UPDATE source_evidence_revisions SET reason = 'tampered' WHERE session_id = ?", session) }
        assertThrows(org.springframework.dao.DataAccessException::class.java) { jdbc.update("DELETE FROM source_evidence_decisions WHERE revision_id = ?", approved.sourceEvidenceRevisions.first().id) }
    }

    @Test
    fun sourceOnlyPublicationReusesAllContentRevisionsAndRequiresTheReviewedRevision() {
        val auth = "source-publisher"
        val actor = Actor(UUID.randomUUID(), "admin@test.local", listOf("admin"), stepUpFresh = true)
        Mockito.`when`(identity.authenticate(auth)).thenReturn(actor)
        val version = UUID.randomUUID()
        val target = UUID.randomUUID()
        val root = fixture()
        val original = com.constitutionatlas.platform.SourceEvidence(coverage = "Excerpt", attribution = "Archive")
        val revised = com.constitutionatlas.platform.SourceEvidence(description = "# Official archive\n\nArticles 1–10 only\n\n[Source](https://example.test/source)")
        val source = com.constitutionatlas.editor.client.CatalogVersion(version, UUID.randomUUID(), "2025", "published", currentVersionId = version, sourceEvidence = original)
        val successor = source.copy(id = target, versionLabel = "2025-correction", publicationStatus = "draft", sourceEvidence = revised)
        Mockito.`when`(catalogClient.getVersion(version)).thenReturn(source)
        Mockito.`when`(sources.source(version)).thenReturn(DraftSource(version, 7, settings.id, listOf(root)))
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        Mockito.`when`(contentClient.listArticles(version)).thenReturn(listOf(com.constitutionatlas.editor.client.ContentTreeArticle(root.logicalId, version, "46a", "Rights", 1, "Before. Original wording. After.")))
        val session = sessions.insertSession(actor.id, version, "editorial_correction")
        editorService.saveSourceEvidence(auth, session, com.constitutionatlas.editor.api.SaveSourceEvidenceRequest(0, revised, "Describe the excerpt precisely"))
        editorService.submitReview(auth, session, 1)
        editorService.approve(auth, session, 1)
        val request = com.constitutionatlas.editor.api.PublishRequest("editorial_correction", sourceEvidenceRevision = 1)
        assertThrows(ConflictException::class.java) { editorService.publish(auth, session, request.copy(sourceEvidenceRevision = 0)) }
        assertThrows(ConflictException::class.java) { editorService.publish(auth, session, request.copy(comment = "Unreviewed reason")) }
        Mockito.`when`(publishClient.reserve(session, source.copy(sourceEvidence = revised), "editorial_correction", "Describe the excerpt precisely", settings.id, auth)).thenReturn(successor)
        val write = com.constitutionatlas.platform.OrderedSnapshotWrite(0, version, 7, listOf(com.constitutionatlas.platform.OrderedNodeWrite(revisionId = root.revisionId)), session)
        val snapshot = com.constitutionatlas.platform.OrderedSnapshot(target, 1, settings.id, listOf(com.constitutionatlas.platform.OrderedNode(root.logicalId, root.revisionId!!, UUID.randomUUID(), root.kind, root.label, root.title, emptyList())))
        Mockito.`when`(publishClient.save(target, write, auth)).thenReturn(snapshot)
        Mockito.`when`(catalogClient.publishVersion(target)).thenReturn(successor.copy(publicationStatus = "published"))
        val published = editorService.publish(auth, session, request)
        assertThat(published.newVersionId).isEqualTo(target)
        assertThat(published.sourceEvidenceDecisions.last().action).isEqualTo("version_published")
        Mockito.verify(publishClient).save(target, write, auth)
        Mockito.verify(contentClient, Mockito.never()).replaceArticles(Mockito.any(UUID::class.java) ?: target, Mockito.anyList())
        assertThat(catalogClient.getVersion(version).sourceEvidence).isEqualTo(original)
        assertThat(editorService.publish(auth, session, request).newVersionId).isEqualTo(target)
    }

    @Test
    fun reviewedDuplicateRowsTransferBySourceIdAndPublishedRetryIsIdempotent() {
        val auth = "Bearer duplicate-review"
        val actor = Actor(UUID.randomUUID(), "reviewer@test.local", listOf("admin"), stepUpFresh = true)
        val version = UUID.randomUUID()
        val target = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val root = fixture()
        val text = root.content[1].node!!.content.single()
        Mockito.`when`(identity.authenticate(auth)).thenReturn(actor)
        Mockito.`when`(sources.source(version)).thenReturn(DraftSource(version, 7, settings.id, listOf(root)))
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        val session = sessions.insertSession(actor.id, version, "legal")
        val preview = drafts.save(auth, session, StructuredDraftSave(0, listOf(DraftOperation(UUID.randomUUID(), "replace_text", text.logicalId!!, text.revisionId!!, text = "Revised wording."))))
        val unit = com.constitutionatlas.editor.api.ChangeRecordUnitRef(logicalId = text.logicalId!!, versionId = version)
        val record = com.constitutionatlas.editor.api.ChangeRecordRequest(
            "Law",
            "Review",
            listOf(com.constitutionatlas.editor.api.ChangeRecordDocument(url = "https://example.test/law")),
            changes = listOf(
                com.constitutionatlas.editor.api.ChangeRecordChange(root.logicalId, "46a", beforeRef = unit, pendingAfterLogicalId = text.logicalId),
                com.constitutionatlas.editor.api.ChangeRecordChange(root.logicalId, "46a", beforeRef = unit, pendingAfterLogicalId = text.logicalId),
            ),
        )
        sessions.recordChangeRecord(session, record)
        val ids = sessions.changeRecord(session)!!.changes.map { it.id!! }
        val review = diffReview.refresh(preview)
        review.candidates.forEach { item -> diffReview.decide(preview, DiffReviewDecisionWrite(preview.generation, item.key, item.fingerprint, "linked", listOf(ids[1])), reviewer = true) }
        val amendmentId = UUID.randomUUID()
        val linkedRows = ids.map { source -> com.constitutionatlas.editor.client.LinkedAmendmentChange(UUID.randomUUID(), sourceChangeId = source, changeType = "changed", beforeRef = com.constitutionatlas.editor.client.LinkedUnitRef(text.logicalId!!), afterRef = com.constitutionatlas.editor.client.LinkedUnitRef(text.logicalId!!)) }
        val initial = com.constitutionatlas.editor.client.LinkedAmendment(amendmentId, constitution, "draft", "Law", "Review", sourceVersionId = version)
        val linked = initial.copy(targetVersionId = target, changes = linkedRows)
        Mockito.`when`(amendmentClient.getAmendment(amendmentId, auth)).thenReturn(initial, linked, linked.copy(status = "published"))
        Mockito.`when`(amendmentClient.diffReview(amendmentId, auth)).thenReturn(com.constitutionatlas.editor.client.AmendmentDiffReviewSnapshot(UUID.randomUUID(), review.candidates))
        amendmentActions.completeLink(amendmentId, version, target, auth, session)
        amendmentActions.completeLink(amendmentId, version, target, auth, session)
        val decision = org.mockito.ArgumentCaptor.forClass(com.constitutionatlas.editor.client.AmendmentDiffDecisionRequest::class.java)
        Mockito.verify(amendmentClient, Mockito.atLeastOnce()).decideDiff(Mockito.eq(amendmentId) ?: amendmentId, decision.capture() ?: com.constitutionatlas.editor.client.AmendmentDiffDecisionRequest(UUID.randomUUID(), "", "", "linked"), Mockito.eq(auth) ?: auth)
        assertThat(decision.allValues.flatMap { it.linkedChangeIds }).contains(linkedRows[1].id)
        assertThat(decision.allValues.flatMap { it.linkedChangeIds }).doesNotContain(linkedRows[0].id)
        Mockito.verify(amendmentClient, Mockito.times(1)).publishAmendment(amendmentId, auth)
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource(
        "editorial_correction,",
        "legal,",
        // SHA-256 of the exact pre-source-review PublishRequest.toString() bytes.
        "editorial_correction,d1a6e65a92335bcec051ab8917065742ec6585134e5aeeaff7fe026136ac6d1d",
        "legal,844e006da3d5d3751283348effeb801a87a855b0f3e52fcf141913acf26093ee",
        // Also retain hashes written after the optional source revision was added.
        "editorial_correction,ebf08c066f8a9a4aac8c0da6c8cdd3403b22f0bebaec9fceee6fdbe907f7d0ac",
        "legal,b6c8d01897615350c38c943ee4e419283b6969497484db5e0f801b7cd7a8e778",
    )
    fun orderedPublishRetriesReuseReservationAndPreserveMapping(hop: String, storedHash: String?) {
        val auth = "Bearer ordered-$hop"
        val actor = Actor(UUID.randomUUID(), "admin@test.local", listOf("admin"), stepUpFresh = true)
        val version = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val target = UUID.randomUUID()
        val root = fixture()
        val entry = root.content[1].node!!.content.single()
        val source = DraftSource(version, 7, settings.id, listOf(root))
        Mockito.`when`(identity.authenticate(auth)).thenReturn(actor)
        Mockito.`when`(sources.source(version)).thenReturn(source)
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        val catalogSource = com.constitutionatlas.editor.client.CatalogVersion(version, constitution, "1", "published", legalVersionId = version, currentVersionId = version, sourceEvidence = com.constitutionatlas.platform.SourceEvidence(attribution = "Archive"))
        val catalogTarget = catalogSource.copy(id = target, versionLabel = "2", publicationStatus = "draft", predecessorVersionId = version, hopKind = hop)
        Mockito.`when`(catalogClient.getVersion(version)).thenReturn(catalogSource)
        Mockito.`when`(catalogClient.listVersions(constitution, "all")).thenReturn(listOf(catalogSource))
        Mockito.`when`(contentClient.listArticles(version)).thenReturn(listOf(com.constitutionatlas.editor.client.ContentTreeArticle(root.logicalId, version, "46a", "Rights", 1)))
        val session = sessions.insertSession(actor.id, version, hop)
        val operation = DraftOperation(UUID.randomUUID(), "replace_text", entry.logicalId!!, entry.revisionId!!, text = "Changed wording.")
        val preview = drafts.save(auth, session, StructuredDraftSave(0, listOf(operation)))
        val record = com.constitutionatlas.editor.api.ChangeRecordRequest(
            "Law",
            "Legal update",
            listOf(com.constitutionatlas.editor.api.ChangeRecordDocument(url = "https://example.test/law")),
            changes = if (hop == "legal") {
                listOf(
                    com.constitutionatlas.editor.api.ChangeRecordChange(
                        articleId = root.logicalId,
                        articleNumber = "46a",
                        beforeRef = com.constitutionatlas.editor.api.ChangeRecordUnitRef(logicalId = entry.logicalId!!, versionId = version),
                        pendingAfterLogicalId = entry.logicalId,
                    ),
                )
            } else {
                emptyList()
            },
        )
        if (hop == "legal") sessions.recordChangeRecord(session, record) else sessions.recordPublishComment(session, "Transcription fix")
        if (hop == "legal") {
            val review = diffReview.refresh(preview)
            assertThat(review.candidates).isNotEmpty()
            val rowId = sessions.changeRecord(session)!!.changes.single().id!!
            review.candidates.forEach { item ->
                diffReview.decide(preview, DiffReviewDecisionWrite(preview.generation, item.key, item.fingerprint, "linked", listOf(rowId)), reviewer = true)
            }
        }
        editorService.submitReview(auth, session)
        editorService.approve(auth, session)
        val amendment = com.constitutionatlas.editor.client.LinkedAmendment(UUID.randomUUID(), constitution, "draft", "Law", "Legal update", listOf(com.constitutionatlas.editor.client.ChangeRecordDocumentDto(url = "https://example.test/law")))
        Mockito.`when`(amendmentClient.createAmendment(Mockito.eq(constitution) ?: constitution, Mockito.any(com.constitutionatlas.editor.api.ChangeRecordRequest::class.java) ?: record, Mockito.eq(auth) ?: auth)).thenReturn(amendment)
        Mockito.`when`(amendmentClient.getAmendment(amendment.id, auth)).thenReturn(amendment)
        val comment = if (hop == "legal") null else "Transcription fix"
        Mockito.`when`(publishClient.reserve(session, catalogSource, hop, comment, settings.id, auth)).thenReturn(catalogTarget)
        fun ordered(node: DraftNode): com.constitutionatlas.platform.OrderedNode = com.constitutionatlas.platform.OrderedNode(node.logicalId, UUID.randomUUID(), UUID.nameUUIDFromBytes("$target:${node.logicalId}".toByteArray()), node.kind, node.label, node.title, node.content.map { item -> item.node?.let { com.constitutionatlas.platform.OrderedEntry("child", node = ordered(it)) } ?: com.constitutionatlas.platform.OrderedEntry("text", logicalId = item.logicalId, revisionId = UUID.randomUUID(), occurrenceId = UUID.nameUUIDFromBytes("$target:${item.logicalId}".toByteArray()), text = item.text) })
        val snapshot = com.constitutionatlas.platform.OrderedSnapshot(target, 1, settings.id, preview.roots.map(::ordered))
        val write = com.constitutionatlas.platform.OrderedSnapshotWrite(0, version, 7, com.constitutionatlas.editor.service.OrderedSuccessorPlan.build(source.roots, preview.roots, preview.operations), session)
        Mockito.`when`(publishClient.save(target, write, auth)).thenThrow(com.constitutionatlas.editor.DownstreamException("content unavailable")).thenReturn(snapshot)
        val request = com.constitutionatlas.editor.api.PublishRequest(hop)
        if (storedHash != null) jdbc.update("INSERT INTO structured_publish_jobs(session_id, request_hash) VALUES (?, ?)", session, storedHash)
        Mockito.`when`(publishClient.reservation(session, auth)).thenReturn(catalogTarget)
        Mockito.`when`(publishClient.reserve(session, catalogSource, hop, comment, settings.id, auth)).thenThrow(ConflictException("Different reserved metadata", "publish_attempt_mismatch")).thenReturn(catalogTarget)
        val mismatch = assertThrows(ConflictException::class.java) { editorService.publish(auth, session, request) }
        assertThat(mismatch.code).isEqualTo("publish_attempt_mismatch")
        Mockito.verify(publishClient, Mockito.never()).save(target, write, auth)
        assertThrows(com.constitutionatlas.editor.DownstreamException::class.java) { editorService.publish(auth, session, request) }
        assertThat(sessions.findSession(session)!!.status).isEqualTo(com.constitutionatlas.editor.api.EditSessionStatus.APPROVED)
        Mockito.`when`(publishClient.reservation(session, auth)).thenReturn(catalogTarget)
        Mockito.`when`(catalogClient.publishVersion(target)).thenThrow(com.constitutionatlas.editor.DownstreamException("publication response lost")).thenReturn(catalogTarget.copy(publicationStatus = "published"))
        assertThrows(com.constitutionatlas.editor.DownstreamException::class.java) { editorService.publish(auth, session, request) }
        val published = editorService.publish(auth, session, request)
        assertThat(published.newVersionId).isEqualTo(target)
        assertThat(published.unitMapping).containsEntry(entry.logicalId.toString(), UUID.nameUUIDFromBytes("$target:${entry.logicalId}".toByteArray()).toString())
        assertThat(published.sourceGeneration).isEqualTo(7)
        assertThat(editorService.publish(auth, session, request).newVersionId).isEqualTo(target)
        if (storedHash != null) assertThat(jdbc.queryForObject("SELECT request_hash FROM structured_publish_jobs WHERE session_id = ?", String::class.java, session)).isEqualTo(storedHash)
        Mockito.verify(publishClient, Mockito.times(3)).save(target, write, auth)
        Mockito.verify(publishClient, Mockito.times(4)).reserve(session, catalogSource, hop, comment, settings.id, auth)
        if (hop == "legal") Mockito.verify(amendmentClient, Mockito.times(1)).createAmendment(Mockito.eq(constitution) ?: constitution, Mockito.any(com.constitutionatlas.editor.api.ChangeRecordRequest::class.java) ?: record, Mockito.eq(auth) ?: auth)
        val payload = jdbc.queryForObject("SELECT payload::text FROM outbox_events WHERE session_id = ? AND event_name = 'version.published'", String::class.java, session)
        assertThat(payload).contains("unitMapping", entry.logicalId.toString(), "sourceGeneration", "settingsRevisionId")
        assertThrows(ConflictException::class.java) { editorService.publish(auth, session, request.copy(comment = "changed retry payload")) }
    }

    @Test
    fun structuredLegalPublishRejectsLegacyChangesWithoutExactUnits() {
        val auth = "Bearer missing-unit-selection"
        val actor = Actor(UUID.randomUUID(), "admin@test.local", listOf("admin"), stepUpFresh = true)
        val version = UUID.randomUUID()
        val root = fixture()
        val source = DraftSource(version, 7, settings.id, listOf(root))
        Mockito.`when`(identity.authenticate(auth)).thenReturn(actor)
        Mockito.`when`(sources.source(version)).thenReturn(source)
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        val session = sessions.insertSession(actor.id, version, "legal")
        val entry = root.content[1].node!!.content.single()
        val operation = DraftOperation(UUID.randomUUID(), "replace_text", entry.logicalId!!, entry.revisionId!!, text = "Changed wording.")
        drafts.save(auth, session, StructuredDraftSave(0, listOf(operation)))
        val record = com.constitutionatlas.editor.api.ChangeRecordRequest(
            "Law",
            "Legal update",
            listOf(com.constitutionatlas.editor.api.ChangeRecordDocument(url = "https://example.test/law")),
            changes = listOf(
                com.constitutionatlas.editor.api.ChangeRecordChange(
                    articleId = root.logicalId,
                    articleNumber = "46a",
                    changeType = "changed",
                ),
            ),
        )
        sessions.recordChangeRecord(session, record)
        val failure = assertThrows(ConflictException::class.java) { editorService.submitReview(auth, session) }
        assertThat(failure.message).contains("Diff review")
    }

    @Test
    fun structuredLegalPublishRequiresBothSidesForChangedUnits() {
        val auth = "Bearer partial-unit-selection"
        val actor = Actor(UUID.randomUUID(), "admin@test.local", listOf("admin"), stepUpFresh = true)
        val version = UUID.randomUUID()
        val root = fixture()
        val source = DraftSource(version, 7, settings.id, listOf(root))
        Mockito.`when`(identity.authenticate(auth)).thenReturn(actor)
        Mockito.`when`(sources.source(version)).thenReturn(source)
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        val session = sessions.insertSession(actor.id, version, "legal")
        val entry = root.content[1].node!!.content.single()
        drafts.save(auth, session, StructuredDraftSave(0, listOf(DraftOperation(UUID.randomUUID(), "replace_text", entry.logicalId!!, entry.revisionId!!, text = "Changed wording."))))
        val record = com.constitutionatlas.editor.api.ChangeRecordRequest(
            "Law",
            "Legal update",
            listOf(com.constitutionatlas.editor.api.ChangeRecordDocument(url = "https://example.test/law")),
            changes = listOf(
                com.constitutionatlas.editor.api.ChangeRecordChange(
                    articleId = root.logicalId,
                    articleNumber = "46a",
                    changeType = "changed",
                    beforeRef = com.constitutionatlas.editor.api.ChangeRecordUnitRef(logicalId = entry.logicalId!!, versionId = version),
                ),
            ),
        )
        sessions.recordChangeRecord(session, record)
        val failure = assertThrows(ConflictException::class.java) { editorService.submitReview(auth, session) }
        assertThat(failure.message).contains("Diff review")
    }

    @Test
    fun editorCanSubmitReasonedExclusionForSeparateReviewerAcknowledgement() {
        val editorAuth = "Bearer guided-editor"
        val reviewerAuth = "Bearer guided-reviewer"
        val editor = Actor(UUID.randomUUID(), "editor@test.local", listOf("editor"))
        val reviewer = Actor(UUID.randomUUID(), "reviewer@test.local", listOf("reviewer"))
        val version = UUID.randomUUID()
        val root = fixture()
        val source = DraftSource(version, 7, settings.id, listOf(root))
        Mockito.`when`(identity.authenticate(editorAuth)).thenReturn(editor)
        Mockito.`when`(identity.authenticate(reviewerAuth)).thenReturn(reviewer)
        Mockito.`when`(sources.source(version)).thenReturn(source)
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        val session = sessions.insertSession(editor.id, version, "legal")
        val entry = root.content[1].node!!.content.single()
        val preview = drafts.save(editorAuth, session, StructuredDraftSave(0, listOf(DraftOperation(UUID.randomUUID(), "replace_text", entry.logicalId!!, entry.revisionId!!, text = "Changed wording."))))
        sessions.recordChangeRecord(session, com.constitutionatlas.editor.api.ChangeRecordRequest("Law", "Legal update", changes = listOf(com.constitutionatlas.editor.api.ChangeRecordChange(root.logicalId, "46a", "changed"))))
        val review = diffReview.refresh(preview)
        assertThat(review.candidates).isNotEmpty()
        review.candidates.forEach { item ->
            diffReview.decide(preview, DiffReviewDecisionWrite(preview.generation, item.key, item.fingerprint, "excluded_with_reason", exclusionReason = "Separate correction"), reviewer = false)
        }
        editorService.submitReview(editorAuth, session)
        assertThrows(ConflictException::class.java) { editorService.approve(reviewerAuth, session) }
        val reviewerPreview = drafts.preview(reviewerAuth, session)
        diffReview.refresh(reviewerPreview).candidates.forEach { item ->
            diffReview.decide(reviewerPreview, DiffReviewDecisionWrite(reviewerPreview.generation, item.key, item.fingerprint, "excluded_with_reason", exclusionReason = "Separate correction", reviewerAcknowledged = true), reviewer = true)
        }
        editorService.approve(reviewerAuth, session)
    }

    @Test
    fun changingSavedRowPairingMarksItsLinkedDecisionForRecheck() {
        val auth = "Bearer pairing-recheck"
        val actor = Actor(UUID.randomUUID(), "editor@test.local", listOf("admin"))
        val version = UUID.randomUUID()
        val root = fixture()
        val entry = root.content[1].node!!.content.single()
        Mockito.`when`(identity.authenticate(auth)).thenReturn(actor)
        Mockito.`when`(sources.source(version)).thenReturn(DraftSource(version, 7, settings.id, listOf(root)))
        Mockito.`when`(sources.settings(version)).thenReturn(settings)
        val session = sessions.insertSession(actor.id, version, "legal")
        val preview = drafts.save(auth, session, StructuredDraftSave(0, listOf(DraftOperation(UUID.randomUUID(), "replace_text", entry.logicalId!!, entry.revisionId!!, text = "Changed wording."))))
        val rowId = UUID.randomUUID()
        val row = com.constitutionatlas.editor.api.ChangeRecordChange(
            root.logicalId,
            "46a",
            beforeRef = com.constitutionatlas.editor.api.ChangeRecordUnitRef(entry.logicalId!!, versionId = version),
            pendingAfterLogicalId = entry.logicalId,
            id = rowId,
        )
        val record = com.constitutionatlas.editor.api.ChangeRecordRequest("Law", "Review", listOf(com.constitutionatlas.editor.api.ChangeRecordDocument(url = "https://example.test/law")), changes = listOf(row))
        editorService.savePublishDetails(auth, session, com.constitutionatlas.editor.api.PublishDetailsRequest(changeRecord = record))
        val candidate = diffReview.refresh(preview).candidates.single()
        diffReview.decide(preview, DiffReviewDecisionWrite(preview.generation, candidate.key, candidate.fingerprint, "linked", listOf(rowId)), reviewer = true)
        assertThat(diffReview.refresh(preview).decisions.single().status).isEqualTo("linked")

        editorService.savePublishDetails(auth, session, com.constitutionatlas.editor.api.PublishDetailsRequest(changeRecord = record.copy(changes = listOf(row.copy(pendingAfterLogicalId = UUID.randomUUID())))))
        val refreshed = diffReview.refresh(preview)
        assertThat(refreshed.decisions.single().status).isEqualTo("needs_recheck")
        assertThat(refreshed.totals["resolved"]).isZero()
    }

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
        val initial = drafts.preview("Bearer test", session)
        assertThat(initial.generation).isZero()
        assertThat(initial.roots).containsExactly(root)
        assertThat(initial.sourceRoots).containsExactly(root)
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM structured_draft_sources WHERE session_id = ?", Int::class.java, session)).isZero()
        val operation = DraftOperation(UUID.randomUUID(), "replace_text", entry.logicalId!!, entry.revisionId!!, text = "Changed wording.")
        val saved = drafts.save("Bearer test", session, StructuredDraftSave(0, listOf(operation)))
        assertThat(saved.roots.single().content[1].node!!.content.single().text).isEqualTo("Changed wording.")
        val initialReview = diffReview.refresh(saved)
        assertThat(initialReview.candidates).isNotEmpty()
        val candidate = initialReview.candidates.single()
        val decided = diffReview.decide(saved, DiffReviewDecisionWrite(saved.generation, candidate.key, candidate.fingerprint, "excluded_with_reason", exclusionReason = "Editorial correction"), reviewer = false)
        assertThat(decided.decisions.single().status).isEqualTo("excluded_with_reason")
        assertThat(diffReview.refresh(drafts.preview("Bearer test", session)).decisions.single().status).isEqualTo("excluded_with_reason")
        assertThat(saved.roots.single().content.first()).isEqualTo(root.content.first())
        assertThat(drafts.preview("Bearer test", session)).isEqualTo(saved)
        val stored = jdbc.queryForObject("SELECT payload::text FROM structured_draft_operations WHERE id = ?", String::class.java, operation.id)!!
        assertThat(stored).contains("Changed wording.").doesNotContain("Before.", "After.", "Original wording.")
        assertThrows(ConflictException::class.java) { drafts.save("Bearer test", session, StructuredDraftSave(0, listOf(operation.copy(id = UUID.randomUUID())))) }
        val revised = drafts.save("Bearer test", session, StructuredDraftSave(1, listOf(DraftOperation(UUID.randomUUID(), "replace_text", entry.logicalId!!, operation.id, text = "Revised wording."))))
        assertThat(diffReview.refresh(revised).decisions.single().status).isEqualTo("needs_recheck")
        Mockito.`when`(sources.source(version)).thenReturn(source.copy(generation = 8))
        assertThrows(ConflictException::class.java) { drafts.preview("Bearer test", session) }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM structured_draft_operations WHERE session_id = ?", Int::class.java, session)).isEqualTo(2)
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

    @Test
    fun rootCommandsAndTemporaryMetadataCorrectionsReplayToValidFinalSnapshot() {
        val first = fixture()
        val second = fixture().copy(label = "bis")
        val required = settings.copy(outline = DraftOutline(settings.outline.kinds.map { it.copy(labelPolicy = "required") }))
        val clear = DraftOperation(UUID.randomUUID(), "set_metadata", first.logicalId, first.revisionId!!, label = "", title = first.title)
        val other = DraftOperation(UUID.randomUUID(), "set_metadata", second.logicalId, second.revisionId!!, label = "(2a)", title = "Other")
        val restore = DraftOperation(UUID.randomUUID(), "set_metadata", first.logicalId, clear.id, label = "46a", title = first.title)
        assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(first, second), listOf(clear), required) }
        val valid = StructuredDraftEngine.replay(listOf(first, second), listOf(clear, other, restore), required)
        assertThat(valid.map { it.label }).containsExactly("46a", "(2a)")
        val fresh = DraftNode(UUID.randomUUID(), kind = "article", label = "new", content = emptyList())
        val add = DraftOperation(UUID.randomUUID(), "insert_root", first.logicalId, first.revisionId!!, position = 1, node = fresh)
        val inserted = StructuredDraftEngine.replay(listOf(first, second), listOf(add), required)
        assertThat(inserted.map { it.logicalId }).containsExactly(first.logicalId, fresh.logicalId, second.logicalId)
        val move = DraftOperation(UUID.randomUUID(), "move_root", fresh.logicalId, add.id, position = 0)
        val remove = DraftOperation(UUID.randomUUID(), "remove", second.logicalId, second.revisionId!!)
        val target = StructuredDraftEngine.replay(inserted, listOf(move, remove), required)
        assertThat(target.map { it.logicalId }).containsExactly(fresh.logicalId, first.logicalId)
        val plan = com.constitutionatlas.editor.service.OrderedSuccessorPlan.build(listOf(first, second), target, listOf(add, move, remove))
        assertThat(plan[1].revisionId).isEqualTo(first.revisionId)
        assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(first), listOf(add.copy(node = fresh.copy(revisionId = first.revisionId))), required) }
    }

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

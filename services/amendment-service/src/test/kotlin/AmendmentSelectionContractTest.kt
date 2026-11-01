package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentChangeWriteRequest
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.amendment.api.AmendmentWriteRequest
import com.constitutionatlas.amendment.api.LinkTargetRequest
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.client.ContentTreeArticle
import com.constitutionatlas.amendment.client.ResolvedContentUnit
import com.constitutionatlas.amendment.repo.AmendmentRepository
import com.constitutionatlas.amendment.repo.ChangeRecordPublishAttemptRepository
import com.constitutionatlas.platform.Actor
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.LocalDate
import java.util.UUID

class AmendmentSelectionContractTest {
    private val constitution = UUID(0, 1)
    private val source = UUID(0, 2)
    private val target = UUID(0, 3)
    private val logical = UUID(0, 4)
    private val actor = Actor(UUID(0, 5), "editor@example.test", listOf("editor"))
    private var tip = amendment(emptyList())
    private val repository = Mockito.mock(AmendmentRepository::class.java) { call ->
        when (call.method.name) {
            "getAmendmentDtoForRevision" -> tip
            "amendmentExists" -> true
            "getAmendmentStatus" -> "draft"
            "findTipRevisionId" -> UUID(0, 6)
            else -> Mockito.RETURNS_DEFAULTS.answer(call)
        }
    }
    private val content = Mockito.mock(ContentClient::class.java)
    private val service = AmendmentService(repository, content, Mockito.mock(CatalogClient::class.java), Mockito.mock(ChangeRecordPublishAttemptRepository::class.java), Mockito.mock(AmendmentDiffReviewService::class.java))

    @Test
    fun `before resolution rejects missing snapshot before resolving after`() {
        val change = AmendmentChangeWriteRequest(changeType = "changed", beforeRef = AmendmentUnitRefDto(logicalId = logical), afterRef = ref(target))
        assertEquals("Before reference needs a version", invalid(change))
        Mockito.verifyNoInteractions(content, repository)
    }

    @Test
    fun `snapshot pin precedes logical identity and downstream lookup`() {
        assertEquals("Before reference is not pinned to this change record's snapshot", invalid(AmendmentChangeWriteRequest(changeType = "removed", beforeRef = AmendmentUnitRefDto(versionId = target))))
        assertEquals("Before reference needs a logical unit", invalid(AmendmentChangeWriteRequest(changeType = "removed", beforeRef = AmendmentUnitRefDto(versionId = source))))
        Mockito.verifyNoInteractions(content, repository)
    }

    @Test
    fun `resolved ownership precedes occurrence revision and kind checks`() {
        val resolved = unit(source)
        val request = AmendmentChangeWriteRequest(changeType = "removed", beforeRef = ref(source).copy(occurrenceId = UUID(9, 1), revisionId = UUID(9, 2), unitKind = "invalid"))
        Mockito.`when`(content.resolve(source, logical)).thenReturn(resolved.copy(constitutionId = UUID(9, 3)))
        assertEquals("Before reference belongs to another constitution", invalid(request))
        Mockito.`when`(content.resolve(source, logical)).thenReturn(resolved)
        assertEquals("Before reference occurrence does not match the pinned snapshot", invalid(request))
        assertEquals("Before reference revision does not match the pinned snapshot", invalid(request.copy(beforeRef = request.beforeRef!!.copy(occurrenceId = null))))
        assertEquals("Before reference has the wrong unit kind", invalid(request.copy(beforeRef = request.beforeRef!!.copy(occurrenceId = null, revisionId = null))))
    }

    @Test
    fun `missing units report the selected side before persistence`() {
        assertEquals("After reference is not in its pinned snapshot", invalid(AmendmentChangeWriteRequest(changeType = "added", afterRef = ref(target))))
        Mockito.verifyNoInteractions(repository)
    }

    @Test
    fun `draft targets retain logical identity without untrusted projections`() {
        val draft = AmendmentUnitRefDto(logicalId = logical, unitKind = "text_entry", text = "Untrusted quote", articleNumber = "wrong")
        create(listOf(AmendmentChangeWriteRequest(articleNumber = "fallback", changeType = "added", afterRef = draft, linkReviewReason = "  ")), targetVersion = null)
        val saved = insertedChanges().single()
        assertEquals("fallback", saved.articleNumber)
        assertEquals(logical, saved.pendingAfterLogicalId)
        assertEquals(null, saved.afterRef)
        assertEquals(null, saved.linkReviewReason)
        Mockito.verifyNoInteractions(content)
    }

    @Test
    fun `draft logical identity precedes kind and duplicates`() {
        assertEquals("After draft reference needs a logical unit", invalid(AmendmentChangeWriteRequest(changeType = "added", afterRef = AmendmentUnitRefDto(unitKind = "invalid")), targetVersion = null))
        assertEquals("After draft reference has an invalid unit kind", invalid(AmendmentChangeWriteRequest(changeType = "added", afterRef = AmendmentUnitRefDto(logicalId = logical, unitKind = "invalid")), targetVersion = null))
        val added = AmendmentChangeWriteRequest(changeType = "added", pendingAfterLogicalId = logical)
        assertEquals("Duplicate draft after reference", assertThrows(IllegalArgumentException::class.java) { create(listOf(added, added), targetVersion = null) }.message)
    }

    @Test
    fun `changed identity reason precedes cross article guard`() {
        val afterLogical = UUID(0, 40)
        Mockito.`when`(content.resolve(source, logical)).thenReturn(unit(source))
        Mockito.`when`(content.resolve(target, afterLogical)).thenReturn(unit(target).copy(logicalId = afterLogical, articleNumber = "8"))
        val change = AmendmentChangeWriteRequest(changeType = "changed", beforeRef = ref(source), afterRef = ref(target).copy(logicalId = afterLogical))
        assertEquals("A changed unit with different logical identities needs a review reason", invalid(change))
        assertEquals("Before and after units must belong to the same article", invalid(change.copy(linkReviewReason = "Matched by reviewer")))
    }

    @Test
    fun `duplicate before and after use separate occurrence namespaces`() {
        Mockito.`when`(content.resolve(source, logical)).thenReturn(unit(source))
        Mockito.`when`(content.resolve(target, logical)).thenReturn(unit(target))
        val removed = AmendmentChangeWriteRequest(changeType = "removed", beforeRef = ref(source))
        assertEquals("Duplicate before reference", assertThrows(IllegalArgumentException::class.java) { create(listOf(removed, removed)) }.message)
        val added = AmendmentChangeWriteRequest(changeType = "added", afterRef = ref(target))
        assertEquals("Duplicate after reference", assertThrows(IllegalArgumentException::class.java) { create(listOf(added, added)) }.message)
    }

    @Test
    fun `resolved quotes replace caller projections in before after order`() {
        Mockito.`when`(content.resolve(source, logical)).thenReturn(unit(source).copy(kind = "parent_text"))
        Mockito.`when`(content.resolve(target, logical)).thenReturn(unit(target).copy(kind = "parent_text"))
        val change = AmendmentChangeWriteRequest(articleNumber = "wrong", changeType = "changed", beforeRef = ref(source).copy(text = "forged"), afterRef = ref(target), linkReviewReason = "  checked  ")
        create(listOf(change))
        val saved = insertedChanges().single()
        assertEquals("7", saved.articleNumber)
        assertEquals("Exact  source.", saved.beforeRef!!.text)
        assertEquals("text_entry", saved.beforeRef!!.unitKind)
        assertEquals("checked", saved.linkReviewReason)
        assertEquals(listOf(source, target), Mockito.mockingDetails(content).invocations.map { it.arguments[0] })
    }

    @Test
    fun `mixed exact links reject before loading snapshots`() {
        tip = amendment(listOf(changeDto(before = ref(source)), changeDto().copy(id = UUID(0, 22))))
        assertEquals("Every change needs an exact unit selection when this record uses exact links", assertThrows(IllegalArgumentException::class.java) { service.linkTarget(tip.id, LinkTargetRequest(targetVersionId = target), actor) }.message)
        Mockito.verifyNoInteractions(content)
    }

    @Test
    fun `linking resolves pending targets and retains metadata`() {
        val original = changeDto(before = ref(source), pending = logical)
        tip = amendment(listOf(original))
        Mockito.`when`(content.resolve(source, logical)).thenReturn(unit(source))
        Mockito.`when`(content.resolve(target, logical)).thenReturn(unit(target))
        service.linkTarget(tip.id, LinkTargetRequest(targetVersionId = target), actor)
        val saved = insertedChanges().single()
        assertEquals(original.id, saved.sourceChangeId)
        assertEquals(original.changedOn, saved.changedOn)
        assertEquals(original.amendingLawCitation, saved.amendingLawCitation)
        assertEquals(null, saved.pendingAfterLogicalId)
        assertEquals(target, saved.afterRef!!.versionId)
        assertEquals(listOf(source, target, source, target), Mockito.mockingDetails(content).invocations.map { it.arguments[0] })
    }

    @Test
    fun `linking without a diff preserves historical changes and source ids`() {
        val original = changeDto()
        tip = amendment(listOf(original))
        Mockito.`when`(content.listArticles(source)).thenReturn(emptyList())
        Mockito.`when`(content.listArticles(target)).thenReturn(emptyList())
        service.linkTarget(tip.id, LinkTargetRequest(targetVersionId = target), actor)
        val saved = insertedChanges().single()
        assertEquals(original.id, saved.sourceChangeId)
        assertEquals(original.note, saved.note)
        assertEquals(original.articleId, saved.articleId)
        assertEquals(listOf(source, target), Mockito.mockingDetails(content).invocations.map { it.arguments[0] })
    }

    @Test
    fun `ambiguous legacy choices reject before a revision write`() {
        tip = amendment(listOf(changeDto()))
        fun article(id: Long, version: UUID) = ContentTreeArticle(UUID(0, id), version, "7", "Rights", 0, body = "Text")
        Mockito.`when`(content.listArticles(source)).thenReturn(listOf(article(100, source), article(101, source)))
        Mockito.`when`(content.listArticles(target)).thenReturn(listOf(article(102, target)))
        val failure = assertThrows(ConflictException::class.java) { service.linkTarget(tip.id, LinkTargetRequest(targetVersionId = target), actor) }
        assertEquals("Change selection is ambiguous; choose the exact constitutional units before publishing", failure.message)
        assertThat(Mockito.mockingDetails(repository).invocations.map { it.method.name }).doesNotContain("insertRevision", "insertChanges")
    }

    /** Exercises public creation so validation still precedes persistence. */
    private fun create(changes: List<AmendmentChangeWriteRequest>, targetVersion: UUID? = target): AmendmentDto = service.createAmendment(constitution, AmendmentWriteRequest(title = "Law", sourceVersionId = source, targetVersionId = targetVersion, changes = changes), actor)

    /** Retains the public exception type and first diagnostic. */
    private fun invalid(change: AmendmentChangeWriteRequest, targetVersion: UUID? = target): String? = assertThrows(IllegalArgumentException::class.java) { create(listOf(change), targetVersion) }.message

    /** Captures the exact payload passed through the public write boundary. */
    @Suppress("UNCHECKED_CAST")
    private fun insertedChanges(): List<AmendmentChangeWriteRequest> = Mockito.mockingDetails(repository).invocations.last { it.method.name == "insertChanges" }.arguments[1] as List<AmendmentChangeWriteRequest>

    /** Requested identity omits all caller-controlled projections. */
    private fun ref(version: UUID) = AmendmentUnitRefDto(versionId = version, logicalId = logical)

    /** Deterministic resolver fixture preserves exact whitespace and snapshot identity. */
    private fun unit(version: UUID) = ResolvedContentUnit(version, constitution, logical, UUID(1, version.leastSignificantBits), UUID(2, version.leastSignificantBits), UUID(3, version.leastSignificantBits), "article", "7", "Exact  source.", "/quote/$version")

    /** Supplies every historical metadata field for link-copy contracts. */
    private fun changeDto(before: AmendmentUnitRefDto? = null, pending: UUID? = null) = AmendmentChangeDto(UUID(0, 20), articleId = UUID(0, 21), articleNumber = "7", changeType = "changed", note = "Original note", nodeId = UUID(0, 23), changedOn = LocalDate.of(2000, 1, 2), effectiveOn = LocalDate.of(2001, 2, 3), amendingLawCitationId = null, amendingLawTitle = "Law", amendingLawCitation = "Citation", beforeRef = before, pendingAfterLogicalId = pending)

    /** Fixed answers avoid depending on generated amendment/revision UUIDs. */
    private fun amendment(changes: List<AmendmentChangeDto>) = AmendmentDto(UUID(0, 10), constitution, "draft", title = "Law", comment = "Comment", enactedOn = null, effectiveOn = null, sourceVersionId = source, targetVersionId = target, changes = changes)
}

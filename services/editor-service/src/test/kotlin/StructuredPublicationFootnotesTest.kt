package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.api.DraftSource
import com.constitutionatlas.editor.api.StructuredDraftPreview
import com.constitutionatlas.editor.client.CatalogVersion
import com.constitutionatlas.editor.client.OrderedPublishClient
import com.constitutionatlas.editor.client.StructuredSourceClient
import com.constitutionatlas.editor.repo.StructuredDraftRepository
import com.constitutionatlas.platform.OrderedContentValidationException
import com.constitutionatlas.platform.OrderedInlineReference
import com.constitutionatlas.platform.OrderedReferenceTarget
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.OrderedSnapshotWrite
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.UUID

class StructuredPublicationFootnotesTest {
    private val sources = Mockito.mock(StructuredSourceClient::class.java)
    private val client = Mockito.mock(OrderedPublishClient::class.java)
    private val service = StructuredPublicationService(Mockito.mock(StructuredDraftRepository::class.java), sources, client)
    private val version = CatalogVersion(UUID.randomUUID(), UUID.randomUUID(), "original", "published")
    private val settings = UUID.randomUUID()
    private val body = DraftEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), text = "Body.")
    private val note = DraftEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), text = "Historical note", format = "footnote", footnoteLabel = "1")
    private fun root(entry: DraftEntry) = DraftNode(UUID.randomUUID(), UUID.randomUUID(), kind = "article", content = listOf(entry))

    @Test
    fun publicationRechecksFinalCardinalityAcrossRootsBeforeReservingASuccessor() {
        val roots = listOf(root(body), root(note))
        val marker = OrderedInlineReference(UUID.randomUUID(), 5, 5, OrderedReferenceTarget("footnote", footnoteId = note.logicalId))
        for (references in listOf(emptyList(), listOf(marker, marker.copy(logicalId = UUID.randomUUID())))) {
            val changed = roots.first().copy(content = listOf(body.copy(references = references)))
            val operation = DraftOperation(UUID.randomUUID(), "replace_text", body.logicalId!!, body.revisionId!!, text = body.text, format = "plain", references = references)
            val preview = preview(roots, listOf(operation)).copy(roots = listOf(changed, roots.last()))
            val failure = assertThrows(OrderedContentValidationException::class.java) { service.write(preview, version, "editorial_correction", null, null) }
            assertThat(failure.errors.single().code).isEqualTo("FOOTNOTE_MARK_CARDINALITY")
            assertThat(failure.errors.single().path).isEqualTo("roots[1].content[0]")
        }
        Mockito.verifyNoInteractions(client)

        val markedRoots = listOf(roots.first().copy(content = listOf(body.copy(references = listOf(marker)))), roots.last())
        val operation = DraftOperation(UUID.randomUUID(), "replace_text", body.logicalId!!, body.revisionId!!, text = body.text, format = "plain", references = listOf(marker))
        assertPublishes(preview(roots, listOf(operation)).copy(roots = markedRoots))
    }

    @Test
    fun sourceInformationOnlyPublicationCanReuseHistoricalUnmarkedNotes() {
        assertPublishes(preview(listOf(root(body), root(note)), emptyList()))
    }

    private fun preview(roots: List<DraftNode>, operations: List<DraftOperation>): StructuredDraftPreview {
        Mockito.`when`(sources.source(version.id)).thenReturn(DraftSource(version.id, 7, settings, roots))
        return StructuredDraftPreview(UUID.randomUUID(), version.id, 7, settings, 1, roots.map { it.revisionId!! }, operations, roots)
    }

    private fun assertPublishes(preview: StructuredDraftPreview) {
        val successor = version.copy(id = UUID.randomUUID(), publicationStatus = "draft")
        val original = sources.source(version.id)
        val request = OrderedSnapshotWrite(0, version.id, 7, OrderedSuccessorPlan.build(original.roots, preview.roots, preview.operations), preview.sessionId)
        val saved = OrderedSnapshot(successor.id, 1, settings, emptyList())
        Mockito.`when`(client.reserve(preview.sessionId, version, "editorial_correction", null, settings, null)).thenReturn(successor)
        Mockito.`when`(client.save(successor.id, request, null)).thenReturn(saved)
        assertThat(service.write(preview, version, "editorial_correction", null, null)).isEqualTo(successor to saved)
        Mockito.verify(client).save(successor.id, request, null)
    }
}

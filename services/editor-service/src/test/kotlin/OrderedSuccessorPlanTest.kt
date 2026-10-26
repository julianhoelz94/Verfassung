package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.api.TextPart
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class OrderedSuccessorPlanTest {
    private fun text(value: String) = DraftEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), text = value)
    private fun node(kind: String, entries: List<DraftEntry>) = DraftNode(UUID.randomUUID(), UUID.randomUUID(), kind = kind, label = "(2a)", content = entries)

    @Test
    fun changedSentenceCopiesOnlyItsAncestorPath() {
        val originalText = text("Before.")
        val sentence = node("sentence", listOf(originalText))
        val sibling = node("sentence", listOf(text("Untouched.")))
        val root = node("article", listOf(DraftEntry("child", node = sentence), DraftEntry("child", node = sibling)))
        val changed = root.copy(content = listOf(DraftEntry("child", node = sentence.copy(content = listOf(originalText.copy(text = "After.")))), root.content[1]))
        val plan = OrderedSuccessorPlan.build(listOf(root), listOf(changed), emptyList()).single()
        assertThat(plan.predecessorRevisionId).isEqualTo(root.revisionId)
        assertThat(plan.content!![1].node!!.revisionId).isEqualTo(sibling.revisionId)
        val sentenceWrite = plan.content!![0].node!!
        assertThat(sentenceWrite.predecessorRevisionId).isEqualTo(sentence.revisionId)
        assertThat(sentenceWrite.content!!.single().predecessorRevisionId).isEqualTo(originalText.revisionId)
    }

    @Test
    fun tokenOnlyChangesReuseTheWholeTree() {
        val root = node("article", listOf(text("Exact  text.\n")))
        val plan = OrderedSuccessorPlan.build(listOf(root), listOf(root.copy(draftId = UUID.randomUUID())), emptyList()).single()
        assertThat(plan.revisionId).isEqualTo(root.revisionId)
        assertThat(plan.content).isNull()
    }

    @Test
    fun splitThenMergeRetainsOriginalRevisionLineage() {
        val old = text("one two")
        val root = node("article", listOf(old))
        val first = TextPart(UUID.randomUUID(), "one ")
        val second = TextPart(UUID.randomUUID(), "two")
        val merged = TextPart(UUID.randomUUID(), "one two")
        val operations = listOf(
            DraftOperation(UUID.randomUUID(), "split_text", old.logicalId!!, old.revisionId!!, parts = listOf(first, second)),
            DraftOperation(UUID.randomUUID(), "merge_text", first.logicalId, UUID.randomUUID(), parts = listOf(merged), mergeIds = listOf(first.logicalId, second.logicalId)),
        )
        val target = root.copy(content = listOf(DraftEntry("text", logicalId = merged.logicalId, text = merged.text)))
        val write = OrderedSuccessorPlan.build(listOf(root), listOf(target), operations).single().content!!.single()
        assertThat(write.lineage).containsExactly(old.revisionId)
        assertThat(write.predecessorRevisionId).isNull()
    }

    @Test
    fun removedAndReorderedRootsMapToSourceIndexes() {
        val first = node("article", listOf(text("First.")))
        val second = node("article", listOf(text("Second.")))
        val version = UUID.randomUUID()
        val settings = UUID.randomUUID()
        val source = com.constitutionatlas.editor.api.DraftSource(version, 7, settings, listOf(first, second))
        val sources = org.mockito.Mockito.mock(com.constitutionatlas.editor.client.StructuredSourceClient::class.java)
        org.mockito.Mockito.`when`(sources.source(version)).thenReturn(source)
        val service = StructuredPublicationService(
            org.mockito.Mockito.mock(com.constitutionatlas.editor.repo.StructuredDraftRepository::class.java),
            sources,
            org.mockito.Mockito.mock(com.constitutionatlas.editor.client.OrderedPublishClient::class.java),
        )
        fun preview(roots: List<DraftNode>) = com.constitutionatlas.editor.api.StructuredDraftPreview(UUID.randomUUID(), version, 7, settings, 1, listOf(first.revisionId!!, second.revisionId!!), emptyList(), roots)
        assertThat(service.changedSourceRootIndexes(preview(listOf(first)))).containsExactly(1)
        assertThat(service.changedSourceRootIndexes(preview(listOf(second, first)))).containsExactly(0, 1)
        assertThat(service.changedSourceRootIndexes(preview(listOf(first, second)))).isEmpty()
    }
}

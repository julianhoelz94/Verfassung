package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.api.TextPart
import com.constitutionatlas.editor.client.DraftLevel
import com.constitutionatlas.editor.client.DraftOutline
import com.constitutionatlas.editor.client.DraftSettings
import com.constitutionatlas.platform.OrderedContentValidationException
import com.constitutionatlas.platform.OrderedInlineReference
import com.constitutionatlas.platform.OrderedReferenceTarget
import com.constitutionatlas.platform.OrderedTextMark
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.util.UUID

class StructuredRichDraftTest {
    private val settings = DraftSettings(UUID.randomUUID(), DraftOutline(listOf(DraftLevel("article", true, false, emptyList(), root = true))))
    private fun text(value: String) = DraftEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), text = value)
    private fun root(vararg entries: DraftEntry) = DraftNode(UUID.randomUUID(), UUID.randomUUID(), kind = "article", content = entries.toList())

    @Test
    fun splitAndMergePreserveFormattingAndReferenceIdentities() {
        val note = text("Source note").copy(format = "footnote", footnoteLabel = "*")
        val anchor = OrderedInlineReference(UUID.randomUUID(), 7, 7, OrderedReferenceTarget("footnote", footnoteId = note.logicalId))
        val entry = text("First. Second!").copy(marks = listOf(OrderedTextMark("bold", 0, 13), OrderedTextMark("italic", 7, 13)), references = listOf(anchor))
        val original = root(entry, note.copy(annotation = com.constitutionatlas.platform.OrderedAnnotation("source", anchorLogicalIds = listOf(entry.logicalId!!))))
        val first = TextPart(UUID.randomUUID(), "First. ")
        val second = TextPart(UUID.randomUUID(), "Second!")
        val split = DraftOperation(UUID.randomUUID(), "split_text", entry.logicalId!!, entry.revisionId!!, parts = listOf(first, second))
        val divided = StructuredDraftEngine.replay(listOf(original), listOf(split), settings).single()
        assertThat(divided.content[0].marks).containsExactly(OrderedTextMark("bold", 0, 7))
        assertThat(divided.content[0].references).containsExactly(anchor)
        assertThat(divided.content.last().annotation!!.anchorLogicalIds).containsExactly(first.logicalId, second.logicalId)
        assertThat(divided.content[1].marks).containsExactly(OrderedTextMark("bold", 0, 6), OrderedTextMark("italic", 0, 6))
        val merge = DraftOperation(UUID.randomUUID(), "merge_text", first.logicalId, split.id, mergeIds = listOf(first.logicalId, second.logicalId), parts = listOf(TextPart(UUID.randomUUID(), entry.text!!)))
        val mergedRoot = StructuredDraftEngine.replay(listOf(original), listOf(split, merge), settings).single()
        val merged = mergedRoot.content.first()
        assertThat(mergedRoot.content.last().annotation!!.anchorLogicalIds).containsExactly(merged.logicalId)
        assertThat(merged.text).isEqualTo(entry.text)
        assertThat(merged.references).containsExactly(anchor)
        assertThat(merged.marks).containsExactly(OrderedTextMark("bold", 0, 13), OrderedTextMark("italic", 7, 13))
    }

    @Test
    fun splitCannotDetachAnExistingReference() {
        val entry = text("First word").copy(references = listOf(OrderedInlineReference(UUID.randomUUID(), 0, 5, OrderedReferenceTarget("external", url = "https://example.org"))))
        val split = DraftOperation(UUID.randomUUID(), "split_text", entry.logicalId!!, entry.revisionId!!, parts = listOf(TextPart(UUID.randomUUID(), "Fir"), TextPart(UUID.randomUUID(), "st word")))
        assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(root(entry)), listOf(split), settings) }
    }

    @Test
    fun removingAMergedSentenceCanExplicitlyPreserveItsNoteAnchors() {
        val retained = DraftNode(UUID.randomUUID(), UUID.randomUUID(), kind = "sentence", content = listOf(text("Retained wording")))
        val removed = DraftNode(UUID.randomUUID(), UUID.randomUUID(), kind = "sentence", content = emptyList())
        val note = text("Source note").copy(format = "footnote", annotation = com.constitutionatlas.platform.OrderedAnnotation("source", anchorLogicalIds = listOf(removed.logicalId)))
        val original = root(DraftEntry("child", node = retained), DraftEntry("child", node = removed), note)
        val outline = DraftSettings(UUID.randomUUID(), DraftOutline(listOf(DraftLevel("article", true, true, listOf("sentence"), root = true), DraftLevel("sentence", true, false, emptyList()))))
        val operation = DraftOperation(UUID.randomUUID(), "remove", removed.logicalId, removed.revisionId!!, replacementId = retained.logicalId)
        val target = StructuredDraftEngine.replay(listOf(original), listOf(operation), outline).single()
        assertThat(target.content.last().annotation!!.anchorLogicalIds).containsExactly(retained.logicalId)
        assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(original), listOf(operation.copy(replacementId = UUID.randomUUID())), outline) }
    }

    @Test
    fun crossRootUnitReferencesFollowExplicitSentenceReplacementWithoutChangingAncestorTokens() {
        val retained = DraftNode(UUID.randomUUID(), UUID.randomUUID(), kind = "sentence", content = listOf(text("Retained")))
        val removed = DraftNode(UUID.randomUUID(), UUID.randomUUID(), kind = "sentence", content = emptyList())
        val first = root(DraftEntry("child", node = retained), DraftEntry("child", node = removed))
        val reference = text("See").copy(references = listOf(OrderedInlineReference(UUID.randomUUID(), 0, 3, OrderedReferenceTarget("unit", logicalId = removed.logicalId))))
        val owner = DraftNode(UUID.randomUUID(), UUID.randomUUID(), kind = "paragraph", content = listOf(reference))
        val second = root(DraftEntry("child", node = owner))
        val outline = DraftSettings(
            UUID.randomUUID(),
            DraftOutline(listOf(DraftLevel("article", true, true, listOf("sentence", "paragraph"), root = true), DraftLevel("sentence", true, false, emptyList()), DraftLevel("paragraph", true, false, emptyList()))),
        )
        val remove = DraftOperation(UUID.randomUUID(), "remove", removed.logicalId, removed.revisionId!!, replacementId = retained.logicalId)
        val changed = StructuredDraftEngine.replay(listOf(first, second), listOf(remove), outline)
        val changedOwner = changed.last().content.single().node!!
        assertThat(changedOwner.content.single().references.single().target.logicalId).isEqualTo(retained.logicalId)
        assertThat(changedOwner.content.single().draftId).isEqualTo(remove.id)
        assertThat(changedOwner.draftId).isEqualTo(remove.id)
        assertThat(changed.last().draftId).isEqualTo(second.draftId)
        val followup = DraftOperation(UUID.randomUUID(), "insert_text", second.logicalId, second.revisionId!!, position = 1, parts = listOf(TextPart(UUID.randomUUID(), "Later body")))
        assertThat(StructuredDraftEngine.replay(listOf(first, second), listOf(remove, followup), outline).last().content).hasSize(2)
    }

    @Test
    fun unitTextReferencesFollowTheFirstSplitPartAndTheMergedSurvivor() {
        val entry = text("One. Two.")
        val reference = text("See A and B").copy(references = listOf(OrderedInlineReference(UUID.randomUUID(), 0, 3, OrderedReferenceTarget("unit", logicalId = entry.logicalId))))
        val original = listOf(root(entry), root(reference))
        val first = TextPart(UUID.randomUUID(), "One. ")
        val second = TextPart(UUID.randomUUID(), "Two.")
        val split = DraftOperation(UUID.randomUUID(), "split_text", entry.logicalId!!, entry.revisionId!!, parts = listOf(first, second))
        val splitRoots = StructuredDraftEngine.replay(original, listOf(split), settings)
        assertThat(splitRoots.last().content.single().references.single().target.logicalId).isEqualTo(first.logicalId)
        val references = listOf(
            reference.references.single().copy(target = OrderedReferenceTarget("unit", logicalId = first.logicalId)),
            OrderedInlineReference(UUID.randomUUID(), 8, 11, OrderedReferenceTarget("unit", logicalId = second.logicalId)),
        )
        val addReference = DraftOperation(UUID.randomUUID(), "replace_text", reference.logicalId!!, split.id, text = reference.text, format = "plain", references = references)
        val merged = TextPart(UUID.randomUUID(), entry.text!!)
        val merge = DraftOperation(UUID.randomUUID(), "merge_text", first.logicalId, split.id, mergeIds = listOf(first.logicalId, second.logicalId), parts = listOf(merged))
        val mergedRoots = StructuredDraftEngine.replay(original, listOf(split, addReference, merge), settings)
        assertThat(mergedRoots.last().content.single().references.map { it.target.logicalId }).containsExactly(merged.logicalId, merged.logicalId)
        assertThat(mergedRoots.last().content.single().draftId).isEqualTo(merge.id)
    }

    @Test
    fun unresolvedUnitReferencesStayReadableInHistoryButCannotBeSaved() {
        val reference = text("See").copy(references = listOf(OrderedInlineReference(UUID.randomUUID(), 0, 3, OrderedReferenceTarget("unit", logicalId = UUID.randomUUID()))))
        val historical = listOf(root(reference))
        assertThat(StructuredDraftEngine.replay(historical, emptyList(), settings, enforceEndnotes = false)).isEqualTo(historical)
        val error = assertThrows(OrderedContentValidationException::class.java) { StructuredDraftEngine.replay(historical, emptyList(), settings) }
        assertThat(error.errors.single().code).isEqualTo("UNIT_REFERENCE_TARGET")
    }

    @Test
    fun newWritesRejectMisplacedNotesWhileSourcePreviewCanStillBeCorrected() {
        val note = text("Source note").copy(format = "footnote")
        val body = text("Later article")
        val first = root(note)
        val second = root(body)
        val original = listOf(first, second)
        assertThat(StructuredDraftEngine.replay(original, emptyList(), settings, enforceEndnotes = false)).isEqualTo(original)
        val error = assertThrows(OrderedContentValidationException::class.java) { StructuredDraftEngine.replay(original, emptyList(), settings) }
        assertThat(error.errors.first().code).isEqualTo("FOOTNOTE_NOT_AT_END")
        val move = DraftOperation(UUID.randomUUID(), "move", note.logicalId!!, note.revisionId!!, destinationParentId = second.logicalId, destinationRevisionId = second.revisionId, position = 1)
        assertThat(StructuredDraftEngine.replay(original, listOf(move), settings).last().content.last().logicalId).isEqualTo(note.logicalId)
    }

    @Test
    fun formattingOnlyEditsReceiveANewImmutableTextRevision() {
        val entry = text("Exact wording")
        val original = root(entry)
        val changed = original.copy(content = listOf(entry.copy(marks = listOf(OrderedTextMark("underline", 0, 5)))))
        val write = OrderedSuccessorPlan.build(listOf(original), listOf(changed), emptyList()).single().content!!.single()
        assertThat(write.predecessorRevisionId).isEqualTo(entry.revisionId)
        assertThat(write.marks).containsExactly(OrderedTextMark("underline", 0, 5))
        assertThat(write.text).isEqualTo(entry.text)
    }
}

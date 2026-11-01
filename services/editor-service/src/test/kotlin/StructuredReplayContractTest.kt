package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.api.TextPart
import com.constitutionatlas.editor.client.DraftLevel
import com.constitutionatlas.editor.client.DraftOutline
import com.constitutionatlas.editor.client.DraftSettings
import com.constitutionatlas.platform.OrderedContentValidationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.util.UUID

class StructuredReplayContractTest {
    private val settings = DraftSettings(id(900), DraftOutline(listOf(DraftLevel("article", true, true, listOf("article"), root = true))))

    @Test
    fun `separator applicability precedes stale target lookup`() {
        val operation = operation("remove", id(99), id(199)).copy(lineBreaksBefore = 1)
        val error = assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(node(1)), listOf(operation), settings) }
        assertEquals("A text separator update requires a rich replace_text operation", error.message)
    }

    @Test
    fun `unused text parts are validated before target revision`() {
        val part = TextPart(id(11), "Unused", lineBreaksBefore = 17)
        val operation = operation("set_metadata", id(99), id(199)).copy(parts = listOf(part))
        val error = assertThrows(OrderedContentValidationException::class.java) { StructuredDraftEngine.replay(listOf(node(1)), listOf(operation), settings) }
        assertEquals("operations[${operation.id}].parts[0].lineBreaksBefore", error.errors.single().path)
        assertEquals(part.logicalId, error.errors.single().logicalId)
    }

    @Test
    fun `node revision takes precedence when an invalid tree repeats identity as text`() {
        val source = node(1, listOf(text(1)))
        val operation = operation("unknown", source.logicalId, id(201))
        val stale = assertThrows(ConflictException::class.java) { StructuredDraftEngine.replay(listOf(source), listOf(operation), settings) }
        assertEquals("Stale or unknown unit '${source.logicalId}'", stale.message)
        val unknown = assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(source), listOf(operation.copy(expectedRevisionId = source.revisionId!!)), settings) }
        assertEquals("Unknown draft operation 'unknown'", unknown.message)
    }

    @Test
    fun `root moves preserve revision tokens for later operations`() {
        val first = node(1)
        val second = node(2)
        val move = operation("move_root", second.logicalId, second.revisionId!!).copy(position = 0)
        val moved = StructuredDraftEngine.replay(listOf(first, second), listOf(move), settings)
        assertEquals(listOf(second, first), moved)
        assertNull(moved.first().draftId)
        val metadata = operation("set_metadata", second.logicalId, second.revisionId!!).copy(id = id(501), title = "Revised")
        val result = StructuredDraftEngine.replay(listOf(first, second), listOf(move, metadata), settings)
        assertEquals("Revised", result.first().title)
        assertEquals(metadata.id, result.first().draftId)
        assertNull(result.last().draftId)
    }

    @Test
    fun `metadata edits stamp the target without stamping unchanged ancestor tokens`() {
        val child = node(2)
        val source = node(1, listOf(DraftEntry("child", node = child)))
        val edit = operation("set_metadata", child.logicalId, child.revisionId!!).copy(title = "Edited")
        val changed = StructuredDraftEngine.replay(listOf(source), listOf(edit), settings).single()
        assertNull(changed.draftId)
        assertEquals(source.revisionId, changed.revisionId)
        assertEquals(edit.id, changed.content.single().node!!.draftId)
        assertEquals("Edited", changed.content.single().node!!.title)
    }

    @Test
    fun `replacement removal checks subtree survival without mutating caller input`() {
        val replacement = node(2)
        val original = node(1, listOf(DraftEntry("child", node = replacement)))
        val remove = operation("remove", original.logicalId, original.revisionId!!).copy(replacementId = replacement.logicalId)
        val error = assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(original), listOf(remove), settings) }
        assertEquals("The replacement cannot be inside the removed subtree", error.message)
        assertEquals(replacement, original.content.single().node)
        assertNull(original.draftId)
    }

    @Test
    fun `moving into the detached subtree fails after destination token validation`() {
        val destination = node(3)
        val moving = node(2, listOf(DraftEntry("child", node = destination)))
        val source = node(1, listOf(DraftEntry("child", node = moving)))
        val move = operation("move", moving.logicalId, moving.revisionId!!).copy(destinationParentId = destination.logicalId, destinationRevisionId = destination.revisionId, position = 0)
        val stale = assertThrows(ConflictException::class.java) { StructuredDraftEngine.replay(listOf(source), listOf(move.copy(destinationRevisionId = id(999))), settings) }
        assertEquals("Stale destination parent", stale.message)
        val detached = assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(source), listOf(move), settings) }
        assertEquals("Move destination cannot be inside the moved subtree", detached.message)
        assertEquals(moving, source.content.single().node)
    }

    @Test
    fun `final outline validation runs after the entire batch including zero operations`() {
        val required = settings.copy(outline = DraftOutline(listOf(settings.outline.kinds.single().copy(labelPolicy = "required"))))
        val source = node(1).copy(label = "Original")
        val clear = operation("set_metadata", source.logicalId, source.revisionId!!)
        val restore = operation("set_metadata", source.logicalId, clear.id).copy(id = id(502), label = "Restored")
        assertEquals("Restored", StructuredDraftEngine.replay(listOf(source), listOf(clear, restore), required).single().label)
        val error = assertThrows(IllegalArgumentException::class.java) { StructuredDraftEngine.replay(listOf(source.copy(label = null)), emptyList(), required) }
        assertEquals("Literal label required at '${source.logicalId}'", error.message)
    }

    /** Stable identities make exact error paths and revision/token precedence reproducible. */
    private fun id(value: Long): UUID = UUID(0, value)

    /** Root and child fixtures use distinct stored revisions without generated draft tokens. */
    private fun node(value: Long, content: List<DraftEntry> = emptyList()) = DraftNode(id(value), id(100 + value), kind = "article", content = content)

    /** Text revisions occupy another range to characterize node-versus-entry token precedence. */
    private fun text(value: Long) = DraftEntry("text", logicalId = id(value), revisionId = id(200 + value), text = "Exact wording")

    /** Operations retain explicit expected tokens; handler-specific fields are supplied in each case. */
    private fun operation(type: String, target: UUID, expected: UUID) = DraftOperation(id(500), type, target, expected)
}

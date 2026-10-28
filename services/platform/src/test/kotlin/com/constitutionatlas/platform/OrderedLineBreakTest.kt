package com.constitutionatlas.platform

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.util.UUID

class OrderedLineBreakTest {
    @Test
    fun `historical JSON defaults to zero while authored layout roundtrips outside text offsets`() {
        val mapper = jacksonObjectMapper()
        assertEquals(0, mapper.readValue("""{"type":"text","text":"Law"}""", OrderedEntry::class.java).lineBreaksBefore)
        assertEquals(0, mapper.readValue("{}", OrderedRichContent::class.java).lineBreaksBefore)
        val rich = OrderedRichContent(marks = listOf(OrderedTextMark("bold", 0, 3)), lineBreaksBefore = 2)
        assertEquals(rich, mapper.readValue(mapper.writeValueAsString(rich), OrderedRichContent::class.java))
        assertFalse(mapper.writeValueAsString(OrderedRichContent()).contains("lineBreaksBefore"))
        val entry = OrderedEntry("text", logicalId = UUID.randomUUID(), text = "Law", marks = rich.marks, lineBreaksBefore = 2)
        assertEquals("First.\n\nLaw", OrderedContentText.entries(listOf(OrderedEntry("text", text = "First."), entry)))
        assertEquals("Law", entry.text)
        assertEquals(3, entry.marks.single().end)
    }

    @Test
    fun `new separator metadata never silently coerces fractional string or null input`() {
        val mapper = jacksonObjectMapper()
        for (value in listOf("1.5", "\"2\"", "null", "2147483648")) {
            assertThrows(RuntimeException::class.java) { mapper.readValue("""{"type":"text","text":"Law","lineBreaksBefore":$value}""", OrderedEntryWrite::class.java) }
            assertThrows(RuntimeException::class.java) { mapper.readValue("""{"lineBreaksBefore":$value}""", OrderedRichContent::class.java) }
        }
        assertEquals(16, mapper.readValue("""{"lineBreaksBefore":16}""", OrderedRichContent::class.java).lineBreaksBefore)
    }

    @Test
    fun `empty text and empty child bodies retain their authored separators`() {
        val first = OrderedEntry("text", text = "First.")
        val empty = OrderedEntry("text", text = "", lineBreaksBefore = 2)
        val second = OrderedEntry("text", text = "Second.")
        assertEquals("First.\n\nSecond.", OrderedContentText.entries(listOf(first, empty, second)))
        val child = OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "sentence", null, null, listOf(empty))
        assertEquals("First.\n\nSecond.", OrderedContentText.entries(listOf(first, OrderedEntry("child", node = child), second)))
        assertEquals("\n\n", OrderedContentText.entries(listOf(empty)))
    }

    @Test
    fun `every entry separator is bounded and child entries cannot hide text layout`() {
        for (count in listOf(0, 16)) assertTrue(OrderedContentRules.lineBreakErrors(count, "text", "entry.lineBreaksBefore").isEmpty())
        for ((type, count) in listOf("text" to -1, "text" to 17, "child" to 1)) {
            val error = OrderedContentRules.lineBreakErrors(count, type, "entry.lineBreaksBefore").single()
            assertEquals("TEXT_LINE_BREAKS", error.code)
            assertEquals("entry.lineBreaksBefore", error.path)
        }
        val node = OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "article", null, null, listOf(OrderedEntry("text", text = "Law", lineBreaksBefore = 17)))
        assertEquals("TEXT_LINE_BREAKS", OrderedContentRules.contentErrors(listOf(node)).single().code)
    }

    @Test
    fun `separator changes invalidate fidelity while historical zero is equivalent`() {
        val logicalId = UUID.randomUUID()
        val actual = OrderedNode(logicalId, UUID.randomUUID(), UUID.randomUUID(), "article", null, null, listOf(OrderedEntry("text", text = "Law", lineBreaksBefore = 2)))
        val expected = OrderedNodeWrite(logicalId = logicalId, kind = "article", content = listOf(OrderedEntryWrite("text", text = "Law", lineBreaksBefore = 2)))
        assertTrue(OrderedContentFidelity.matches(listOf(expected), listOf(actual)))
        assertFalse(OrderedContentFidelity.matches(listOf(expected.copy(content = listOf(expected.content!!.single().copy(lineBreaksBefore = 0)))), listOf(actual)))
        assertTrue(OrderedContentFidelity.matches(listOf(expected.copy(content = listOf(OrderedEntryWrite("text", text = "Law")))), listOf(actual.copy(content = listOf(OrderedEntry("text", text = "Law"))))))
    }

    @Test
    fun `editor save marker cardinality is separate from historical import validation`() {
        val note = UUID.randomUUID()
        val position = OrderedContentPosition("roots[1].content[0]", note, format = "footnote")
        val marker = OrderedInlineReference(UUID.randomUUID(), 0, 0, OrderedReferenceTarget("footnote", footnoteId = note))
        assertTrue(OrderedContentRules.footnoteMarkerErrors(listOf(position), listOf(marker)).isEmpty())
        for (references in listOf(emptyList(), listOf(marker, marker.copy(logicalId = UUID.randomUUID())))) {
            val error = OrderedContentRules.footnoteMarkerErrors(listOf(position), references).single()
            assertEquals("FOOTNOTE_MARK_CARDINALITY", error.code)
            assertEquals(note, error.logicalId)
        }
    }

    @Test
    fun `pre-separator marked receipts remain valid only for zero layout`() {
        val entry = OrderedEntryWrite("text", text = "Law", marks = listOf(OrderedTextMark("bold", 0, 3)))
        val request = OrderedSnapshotWrite(0, roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(entry))))
        val before = "OrderedSnapshotWrite(expectedGeneration=0, sourceVersionId=null, sourceGeneration=null, roots=[OrderedNodeWrite(revisionId=null, logicalId=null, predecessorRevisionId=null, kind=article, label=null, title=null, content=[OrderedEntryWrite(type=text, node=null, revisionId=null, logicalId=null, predecessorRevisionId=null, text=Law, lineage=[], format=null, table=null, footnoteLabel=null, references=[], annotation=null, marks=[OrderedTextMark(type=bold, start=0, end=3)])], lineage=[])], publishAttemptId=null)"
        val hash = java.security.MessageDigest.getInstance("SHA-256").digest(before.toByteArray()).joinToString("") { "%02x".format(it) }
        assertTrue(hash in OrderedWriteFingerprint.accepted(request))
        val layout = request.copy(roots = listOf(request.roots.single().copy(content = listOf(entry.copy(lineBreaksBefore = 2)))))
        assertEquals(setOf(OrderedWriteFingerprint.current(layout)), OrderedWriteFingerprint.accepted(layout))
        assertFalse(hash in OrderedWriteFingerprint.accepted(layout))
    }
}

package com.constitutionatlas.platform

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class OrderedContentRulesTest {
    private fun text(text: String, format: String? = null) = OrderedEntryWrite("text", logicalId = UUID.randomUUID(), text = text, format = format)
    private fun root(vararg entries: OrderedEntryWrite) = OrderedNodeWrite(logicalId = UUID.randomUUID(), kind = "article", content = entries.toList())

    @Test
    fun `legacy receipts remain valid only for writes without the new marks field`() {
        val request = OrderedSnapshotWrite(
            0,
            roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", text = "Literal, marks=[] in source")))),
        )
        val legacy = "OrderedSnapshotWrite(expectedGeneration=0, sourceVersionId=null, sourceGeneration=null, roots=[OrderedNodeWrite(revisionId=null, logicalId=null, predecessorRevisionId=null, kind=article, label=null, title=null, content=[OrderedEntryWrite(type=text, node=null, revisionId=null, logicalId=null, predecessorRevisionId=null, text=Literal, marks=[] in source, lineage=[], format=null, table=null, footnoteLabel=null, references=[], annotation=null)], lineage=[])], publishAttemptId=null)"
        val hash = java.security.MessageDigest.getInstance("SHA-256").digest(legacy.toByteArray()).joinToString("") { "%02x".format(it) }
        assertTrue(hash in OrderedWriteFingerprint.accepted(request))
        val marked = request.copy(roots = listOf(root(text("Law").copy(marks = listOf(OrderedTextMark("bold", 0, 3))))))
        assertEquals(setOf(OrderedWriteFingerprint.current(marked)), OrderedWriteFingerprint.accepted(marked))
    }

    @Test
    fun `all roots and nested units participate in one endnotes sequence`() {
        val first = root(text("Body one."))
        val final = root(OrderedEntryWrite("child", node = root(text("Body two."), text("Note A", "footnote"), text("Note B", "footnote"))))
        assertTrue(OrderedContentRules.endnoteErrors(OrderedContentRules.writePositions(listOf(first, final))).isEmpty())
        for (later in listOf(text("Later body"), text("", "table"), OrderedEntryWrite("child", node = root(text("Nested body"))))) {
            val errors = OrderedContentRules.endnoteErrors(OrderedContentRules.writePositions(listOf(root(text("Note", "footnote"), later))))
            assertEquals("FOOTNOTE_NOT_AT_END", errors.first().code)
            assertTrue(errors.first().path.startsWith("roots[0].content[1]"))
        }
        val errors = OrderedContentRules.endnoteErrors(OrderedContentRules.writePositions(listOf(root(text("Note", "footnote")), first)))
        assertEquals("roots[1]", errors.first().path)
        val ex = assertThrows(OrderedContentValidationException::class.java) { OrderedContentRules.requireValid(errors) }
        assertEquals("FOOTNOTE_NOT_AT_END", ex.body()["code"])
        assertEquals(first.logicalId.toString(), ex.body()["logicalId"])
    }

    @Test
    fun `marks allow combined styles and reject malformed overlaps and surrogate cuts`() {
        val value = "A 😀 right"
        assertTrue(OrderedContentRules.markErrors(value, "plain", listOf(OrderedTextMark("bold", 0, value.length), OrderedTextMark("italic", 2, 4)), "text").isEmpty())
        for (mark in listOf(OrderedTextMark("html", 0, 1), OrderedTextMark("bold", -1, 2), OrderedTextMark("bold", 2, 3), OrderedTextMark("bold", 4, 50), OrderedTextMark("bold", 1, 1))) {
            assertEquals("TEXT_MARK_RANGE", OrderedContentRules.markErrors(value, "plain", listOf(mark), "text").first().code)
        }
        assertEquals("TEXT_MARK_OVERLAP", OrderedContentRules.markErrors(value, "plain", listOf(OrderedTextMark("bold", 0, 5), OrderedTextMark("bold", 4, 8)), "text").single().code)
        assertEquals("TEXT_MARK_FORMAT", OrderedContentRules.markErrors(value, "table", listOf(OrderedTextMark("bold", 0, 1)), "text").single().code)
    }

    @Test
    fun `cursor footnote anchors resolve globally without adding source characters`() {
        val note = UUID.randomUUID()
        val reference = OrderedInlineReference(UUID.randomUUID(), 3, 3, OrderedReferenceTarget("footnote", footnoteId = note))
        assertTrue(OrderedContentRules.referenceErrors("Law", "plain", listOf(reference), setOf(note), "text").isEmpty())
        assertEquals("INLINE_REFERENCE", OrderedContentRules.referenceErrors("Law", "plain", listOf(reference), emptySet(), "text").single().code)
        assertEquals("INLINE_REFERENCE", OrderedContentRules.referenceErrors("Law", "plain", listOf(reference.copy(target = OrderedReferenceTarget("external", url = "https://example.org"))), emptySet(), "text").single().code)
    }

    @Test
    fun `boundary footnote anchors coexist with links regardless of authored reference order`() {
        val note = UUID.randomUUID()
        fun link(start: Int, end: Int) = OrderedInlineReference(UUID.randomUUID(), start, end, OrderedReferenceTarget("external", url = "https://example.org"))
        fun marker(offset: Int) = OrderedInlineReference(UUID.randomUUID(), offset, offset, OrderedReferenceTarget("footnote", footnoteId = note))
        val links = listOf(link(0, 3), link(3, 6))
        val references = links + listOf(marker(0), marker(3), marker(6))
        for (ordered in listOf(references, references.reversed())) {
            assertTrue(OrderedContentRules.referenceErrors("LawLaw", "plain", ordered, setOf(note), "text").isEmpty())
        }
        val invalid = OrderedContentRules.referenceErrors("LawLaw", "plain", links + marker(1), setOf(note), "text").single()
        assertEquals("INLINE_REFERENCE", invalid.code)
        assertEquals("text.references[2]", invalid.path)
    }

    @Test
    fun `new writes resolve both node and text unit targets in their version`() {
        val target = UUID.randomUUID()
        val reference = OrderedInlineReference(UUID.randomUUID(), 0, 3, OrderedReferenceTarget("unit", logicalId = target))
        assertTrue(OrderedContentRules.referenceErrors("Law", "plain", listOf(reference), emptySet(), "text", units = setOf(target)).isEmpty())
        assertEquals("UNIT_REFERENCE_TARGET", OrderedContentRules.referenceErrors("Law", "plain", listOf(reference), emptySet(), "text", units = emptySet()).single().code)
        assertTrue(OrderedContentRules.referenceErrors("Law", "plain", listOf(reference), emptySet(), "historical-text").isEmpty())
    }
}

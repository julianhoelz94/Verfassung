package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.platform.OrderedInlineReference
import com.constitutionatlas.platform.OrderedTextMark

/** Text operations preserve exact characters, UTF-16 spans, separators and reference identity. */
internal object DraftReplayText {
    /** An absent format changes wording only; an explicit format replaces the full rich payload. */
    fun replace(step: DraftReplayStep) {
        step.targetText {
            listOf(
                it.copy(
                    text = step.operation.text ?: throw IllegalArgumentException("text is required"),
                    draftId = step.operation.id,
                    format = step.operation.format ?: it.format,
                    table = if (step.operation.format != null) step.operation.table else it.table,
                    footnoteLabel = if (step.operation.format != null) step.operation.footnoteLabel else it.footnoteLabel,
                    references = if (step.operation.format != null) step.operation.references else it.references,
                    annotation = if (step.operation.format != null) step.operation.annotation else it.annotation,
                    marks = if (step.operation.format != null) step.operation.marks else it.marks,
                    lineBreaksBefore = if (step.operation.format != null) step.operation.lineBreaksBefore ?: it.lineBreaksBefore else it.lineBreaksBefore,
                ),
            )
        }
    }

    /** Requires exact concatenation and unsliced references, retaining first-part leading separators. */
    fun split(step: DraftReplayStep) {
        step.targetText { entry ->
            require(step.operation.parts.size >= 2 && step.operation.parts.joinToString("") { it.text } == entry.text) { "Split must preserve exact text and provide at least two parts" }
            require((entry.format == null || entry.format == "plain") && entry.table == null) { "Only plain text entries can be split" }
            val boundaries = step.operation.parts.runningFold(0) { offset, part -> offset + part.text.length }
            require(entry.references.none { ref -> boundaries.drop(1).dropLast(1).any { ref.start < it && it < ref.end } }) { "A split cannot cut an inline reference; move the boundary outside the reference" }
            step.operation.parts.mapIndexed { index, part ->
                val start = boundaries[index]
                val end = boundaries[index + 1]
                DraftEntry("text", logicalId = part.logicalId, draftId = step.operation.id, text = part.text, marks = sliceMarks(entry.marks, start, end), references = sliceReferences(entry.references, start, end), lineBreaksBefore = if (index == 0) entry.lineBreaksBefore else part.lineBreaksBefore)
            }
        }
        step.remapTargets(mapOf(step.operation.targetId to step.operation.parts.map { it.logicalId }))
    }

    /** Combines adjacent plain entries, shifts spans, normalizes marks and remaps old identities. */
    fun merge(step: DraftReplayStep) {
        require(step.operation.mergeIds.size >= 2 && step.operation.mergeIds.first() == step.operation.targetId && step.operation.mergeIds.distinct().size == step.operation.mergeIds.size) { "Merge requires distinct adjacent text identities" }
        var merged = false
        step.updateNodes { node ->
            val first = node.content.indexOfFirst { it.logicalId == step.operation.targetId }
            if (first < 0) {
                node
            } else {
                val entries = node.content.drop(first).take(step.operation.mergeIds.size)
                require(entries.map { it.logicalId } == step.operation.mergeIds && entries.all { it.type == "text" && (it.format == null || it.format == "plain") && it.table == null }) { "Merge cannot cross a child or rich entry boundary" }
                val part = step.operation.parts.singleOrNull() ?: throw IllegalArgumentException("Merge requires one new text identity")
                require(part.text == entries.joinToString("") { it.text.orEmpty() }) { "Merge must preserve exact text" }
                merged = true
                var offset = 0
                val marks = mutableListOf<OrderedTextMark>()
                val references = mutableListOf<OrderedInlineReference>()
                entries.forEach { entry ->
                    marks += entry.marks.map { it.copy(start = it.start + offset, end = it.end + offset) }
                    references += entry.references.map { it.copy(start = it.start + offset, end = it.end + offset) }
                    offset += entry.text.orEmpty().length
                }
                node.copy(draftId = step.operation.id, content = node.content.take(first) + DraftEntry("text", logicalId = part.logicalId, draftId = step.operation.id, text = part.text, marks = normalizeMarks(marks), references = references, lineBreaksBefore = entries.first().lineBreaksBefore) + node.content.drop(first + entries.size))
            }
        }
        require(merged) { "Merge target not found" }
        step.remapTargets(step.operation.mergeIds.associateWith { listOf(step.operation.parts.single().logicalId) })
    }

    /** Clips every overlapping mark to this part without normalizing or dropping its style. */
    private fun sliceMarks(marks: List<OrderedTextMark>, start: Int, end: Int): List<OrderedTextMark> = marks.mapNotNull { mark ->
        val from = maxOf(start, mark.start)
        val until = minOf(end, mark.end)
        if (from < until) mark.copy(start = from - start, end = until - start) else null
    }

    /** Adjacent or overlapping marks of one style become one stable sorted span. */
    private fun normalizeMarks(marks: List<OrderedTextMark>): List<OrderedTextMark> = buildList {
        marks.sortedWith(compareBy<OrderedTextMark> { it.type }.thenBy { it.start }.thenBy { it.end }).forEach { mark ->
            val previous = lastOrNull()
            if (previous?.type == mark.type && previous.end >= mark.start) set(lastIndex, previous.copy(end = maxOf(previous.end, mark.end))) else add(mark)
        }
    }

    /** Zero-width references belong to the preceding part except for the initial zero boundary. */
    private fun sliceReferences(references: List<OrderedInlineReference>, start: Int, end: Int): List<OrderedInlineReference> = references.filter { ref ->
        if (ref.start == ref.end) {
            (ref.start > start || start == 0 && ref.start == 0) && ref.start <= end
        } else {
            ref.start >= start && ref.end <= end
        }
    }.map { it.copy(start = it.start - start, end = it.end - start) }
}

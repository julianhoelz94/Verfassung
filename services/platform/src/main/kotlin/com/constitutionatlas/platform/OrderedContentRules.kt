package com.constitutionatlas.platform

import java.util.UUID

data class OrderedValidationError(val code: String, val path: String, val logicalId: UUID?, val detail: String) {
    val message: String get() = "$code: $path${logicalId?.let { " ('$it')" }.orEmpty()}: $detail"
}

class OrderedContentValidationException(val errors: List<OrderedValidationError>) : IllegalArgumentException(errors.joinToString("; ") { it.message }) {
    fun body(): Map<String, String> = buildMap {
        put("error", message.orEmpty())
        errors.firstOrNull()?.let { error ->
            put("code", error.code)
            put("path", error.path)
            error.logicalId?.let { put("logicalId", it.toString()) }
        }
    }
}

/** Adapters emit nodes on entry and text in stored order, across all roots. */
data class OrderedContentPosition(val path: String, val logicalId: UUID?, val node: Boolean = false, val format: String? = null, val text: String? = null, val references: List<OrderedInlineReference> = emptyList())

/** Deterministic rules used by import feedback, draft replay and the Content write authority. */
object OrderedContentRules {
    fun contentErrors(roots: List<OrderedNode>): List<OrderedValidationError> {
        val positions = positions(roots)
        val errors = endnoteErrors(positions).toMutableList()
        val footnotes = positions.filter { it.format == "footnote" }.mapNotNull { it.logicalId }.toSet()
        val units = positions.mapNotNull { it.logicalId }.toSet()
        fun walk(node: OrderedNode, path: String) {
            node.content.forEachIndexed { index, entry ->
                val entryPath = "$path.content[$index]"
                errors += lineBreakErrors(entry.lineBreaksBefore, entry.type, "$entryPath.lineBreaksBefore", entry.logicalId)
                entry.node?.let { walk(it, "$entryPath.node") } ?: run {
                    errors += markErrors(entry.text.orEmpty(), entry.format, entry.marks, "$entryPath.marks", entry.logicalId)
                    errors += referenceErrors(entry.text.orEmpty(), entry.format, entry.references, footnotes, entryPath, entry.logicalId, units)
                }
            }
        }
        roots.forEachIndexed { index, root -> walk(root, "roots[$index]") }
        errors += referenceIdentityErrors(positions)
        errors += footnoteMarkerErrors(roots)
        return errors
    }

    fun endnoteErrors(positions: Iterable<OrderedContentPosition>): List<OrderedValidationError> {
        val errors = mutableListOf<OrderedValidationError>()
        var firstNote: OrderedContentPosition? = null
        positions.forEach { item ->
            if (!item.node && item.format == "footnote") {
                if (firstNote == null) firstNote = item
            } else if (firstNote != null && (item.node || item.format == "table" || !item.text.isNullOrBlank())) {
                errors += OrderedValidationError("FOOTNOTE_NOT_AT_END", item.path, item.logicalId, "Body content follows the endnotes beginning at ${firstNote!!.path}; move all footnote bodies to the end of the constitution")
            }
        }
        return errors
    }

    fun positions(roots: List<OrderedNode>): List<OrderedContentPosition> = buildList {
        fun walk(node: OrderedNode, path: String) {
            add(OrderedContentPosition(path, node.logicalId, node = true))
            node.content.forEachIndexed { index, entry ->
                val entryPath = "$path.content[$index]"
                entry.node?.let { walk(it, "$entryPath.node") }
                    ?: add(OrderedContentPosition(entryPath, entry.logicalId, format = entry.format, text = entry.text, references = entry.references))
            }
        }
        roots.forEachIndexed { index, root -> walk(root, "roots[$index]") }
    }

    fun writePositions(roots: List<OrderedNodeWrite>): List<OrderedContentPosition> = buildList {
        fun walk(node: OrderedNodeWrite, path: String) {
            add(OrderedContentPosition(path, node.logicalId, node = true))
            node.content.orEmpty().forEachIndexed { index, entry ->
                val entryPath = "$path.content[$index]"
                entry.node?.let { walk(it, "$entryPath.node") }
                    ?: add(OrderedContentPosition(entryPath, entry.logicalId, format = entry.format, text = entry.text, references = entry.references))
            }
        }
        roots.forEachIndexed { index, root -> walk(root, "roots[$index]") }
    }

    /** Reference identities belong to the complete constitution, across every reference type. */
    fun referenceIdentityErrors(positions: Iterable<OrderedContentPosition>): List<OrderedValidationError> {
        val identities = mutableSetOf<UUID>()
        return buildList {
            positions.forEach { position ->
                position.references.forEachIndexed { index, reference ->
                    if (!identities.add(reference.logicalId)) add(OrderedValidationError("INLINE_REFERENCE", "${position.path}.references[$index]", position.logicalId, "Inline reference identity '${reference.logicalId}' is repeated; each marker or link requires its own identity"))
                }
            }
        }
    }

    /** Complete snapshots require a marker for every note; references may share a note body. */
    fun footnoteMarkerErrors(notes: Iterable<OrderedContentPosition>, references: Iterable<OrderedInlineReference>): List<OrderedValidationError> {
        val counts = references.filter { it.target.type == "footnote" }.groupingBy { it.target.footnoteId }.eachCount()
        return notes.filter { it.format == "footnote" }.mapNotNull { note ->
            val count = counts[note.logicalId] ?: 0
            if (count > 0) null else OrderedValidationError("FOOTNOTE_MARK_CARDINALITY", note.path, note.logicalId, "Footnote body has no marker; add at least one inline footnote reference targeting this note")
        }
    }

    fun footnoteMarkerErrors(roots: List<OrderedNode>): List<OrderedValidationError> {
        val references = mutableListOf<OrderedInlineReference>()
        fun walk(node: OrderedNode) {
            node.content.forEach { entry -> entry.node?.let(::walk) ?: references.addAll(entry.references) }
        }
        roots.forEach(::walk)
        return footnoteMarkerErrors(positions(roots), references)
    }

    /** Only call for a complete submitted constitution, never a page or configuration sample. */
    fun writeFootnoteMarkerErrors(roots: List<OrderedNodeWrite>): List<OrderedValidationError> {
        val references = mutableListOf<OrderedInlineReference>()
        fun walk(node: OrderedNodeWrite) {
            node.content.orEmpty().forEach { entry -> entry.node?.let(::walk) ?: references.addAll(entry.references) }
        }
        roots.forEach(::walk)
        return footnoteMarkerErrors(writePositions(roots), references)
    }

    fun lineBreakErrors(count: Int, type: String, path: String, logicalId: UUID? = null): List<OrderedValidationError> =
        if (count !in 0..16 || type != "text" && count != 0) {
            listOf(OrderedValidationError("TEXT_LINE_BREAKS", path, logicalId, "Text entry lineBreaksBefore must be an integer from 0 to 16; child entries cannot carry text separators"))
        } else {
            emptyList()
        }

    fun markErrors(text: String, format: String?, marks: List<OrderedTextMark>, path: String, logicalId: UUID? = null): List<OrderedValidationError> {
        val errors = mutableListOf<OrderedValidationError>()
        if (marks.size > 4096) return listOf(OrderedValidationError("TEXT_MARK_LIMIT", path, logicalId, "At most 4096 inline marks are allowed per text entry"))
        if (marks.isNotEmpty() && (format ?: "plain") !in setOf("plain", "footnote")) errors += OrderedValidationError("TEXT_MARK_FORMAT", path, logicalId, "Inline marks require plain text or a footnote body")
        val ends = mutableMapOf<String, Int>()
        marks.sortedWith(compareBy<OrderedTextMark> { it.type }.thenBy { it.start }.thenBy { it.end }).forEach { mark ->
            val valid = mark.type in setOf("bold", "italic", "underline", "strikethrough") &&
                mark.start >= 0 &&
                mark.start < mark.end &&
                mark.end <= text.length &&
                !splitsSurrogate(text, mark.start) &&
                !splitsSurrogate(text, mark.end)
            if (!valid) errors += OrderedValidationError("TEXT_MARK_RANGE", path, logicalId, "Invalid style or UTF-16 range '${mark.type}' [${mark.start},${mark.end})")
            if (mark.start < (ends[mark.type] ?: 0)) errors += OrderedValidationError("TEXT_MARK_OVERLAP", path, logicalId, "Overlapping ranges of the same style must be normalized")
            ends[mark.type] = maxOf(ends[mark.type] ?: 0, mark.end)
        }
        return errors
    }

    fun requireValid(errors: List<OrderedValidationError>) {
        if (errors.isNotEmpty()) throw OrderedContentValidationException(errors)
    }

    fun referenceErrors(text: String, format: String?, references: List<OrderedInlineReference>, footnotes: Set<UUID>, path: String, logicalId: UUID? = null, units: Set<UUID>? = null): List<OrderedValidationError> {
        val errors = mutableListOf<OrderedValidationError>()
        var end = 0
        val identities = mutableSetOf<UUID>()
        references.withIndex().sortedWith(compareBy<IndexedValue<OrderedInlineReference>> { it.value.start }.thenBy { it.value.end }).forEach { (index, reference) ->
            val target = reference.target
            val span = reference.start >= end &&
                reference.start >= 0 &&
                reference.end <= text.length &&
                (reference.start < reference.end || reference.start == reference.end && target.type == "footnote") &&
                !splitsSurrogate(text, reference.start) &&
                !splitsSurrogate(text, reference.end)
            val validTarget = when (target.type) {
                "unit" -> target.logicalId != null && target.url == null && target.footnoteId == null && (units == null || target.logicalId in units)
                "external" -> target.url?.startsWith("https://") == true && target.logicalId == null && target.footnoteId == null
                "footnote" -> target.footnoteId in footnotes && target.logicalId == null && target.url == null
                else -> false
            }
            if ((format ?: "plain") != "plain" || !identities.add(reference.logicalId) || !span || !validTarget) {
                val missingUnit = target.type == "unit" && target.logicalId != null && units != null && target.logicalId !in units
                errors += if (missingUnit) {
                    OrderedValidationError("UNIT_REFERENCE_TARGET", "$path.references[$index]", logicalId, "Unit target '${target.logicalId}' is not part of this constitution version; choose an existing unit or text entry, or remove the reference")
                } else {
                    OrderedValidationError("INLINE_REFERENCE", "$path.references[$index]", logicalId, "Invalid, overlapping or unresolved inline reference")
                }
            }
            end = maxOf(end, reference.end)
        }
        return errors
    }

    private fun splitsSurrogate(text: String, offset: Int): Boolean = offset in 1 until text.length && text[offset - 1].isHighSurrogate() && text[offset].isLowSurrogate()
}

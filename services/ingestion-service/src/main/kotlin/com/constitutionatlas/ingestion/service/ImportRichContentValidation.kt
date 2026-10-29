package com.constitutionatlas.ingestion.service

import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedTable
import com.constitutionatlas.platform.OrderedValidationError

/** Import-specific payload checks and the shared complete-document rich-content validation pass. */
internal object ImportRichContentValidation {
    /** Annotation checks apply to every entry; format and table checks apply only to text entries. */
    fun entryErrors(entry: OrderedEntryWrite, path: String): List<Pair<String, String>> = buildList {
        runCatching { entry.annotation?.validate() }.exceptionOrNull()?.let { add("ANNOTATION" to (it.message ?: "Invalid annotation")) }
        if (entry.annotation != null && entry.format != "footnote") add("ANNOTATION" to "$path: annotations require a footnote entry")
        if (entry.type == "text") {
            val format = entry.format ?: "plain"
            if (format !in setOf("plain", "table", "footnote") || (format == "table") != (entry.table != null)) {
                add("RICH_FORMAT" to "$path: format and table payload must agree")
            }
            if (format == "footnote" && entry.text.isNullOrBlank()) add("FOOTNOTE_BODY" to "$path: footnote body is required")
            entry.table?.let { addAll(tableErrors(it, path)) }
        }
    }

    /** Checks row shape before cells, with header references resolved across the entire table. */
    private fun tableErrors(table: OrderedTable, path: String): List<Pair<String, String>> = buildList {
        if (table.rows.isEmpty() || table.rows.any { it.cells.isEmpty() }) add("TABLE_SHAPE" to "$path: table rows need cells")
        val headers = table.rows.flatMap { it.cells }.filter { it.header }.map { it.logicalId }.toSet()
        table.rows.forEachIndexed { rowIndex, row ->
            row.cells.forEachIndexed { cellIndex, cell ->
                if (cell.rowSpan !in 1..100 || cell.colSpan !in 1..100 || cell.headers.any { it !in headers }) {
                    add("TABLE_CELL" to "$path.table.rows[$rowIndex].cells[$cellIndex]: invalid span or header target")
                }
            }
        }
    }

    /**
     * Validates the complete document, including references between roots and endnote cardinality.
     * Preparation and retry callers use this independently of full request validation. Rule order
     * remains endnotes, entry traversal, reference identities, then missing footnote markers.
     */
    fun documentErrors(roots: List<OrderedNodeWrite>): List<OrderedValidationError> {
        val positions = OrderedContentRules.writePositions(roots)
        val errors = OrderedContentRules.endnoteErrors(positions).toMutableList()
        val footnotes = positions.filter { it.format == "footnote" }.mapNotNull { it.logicalId }.toSet()
        val units = positions.mapNotNull { it.logicalId }.toSet()

        /** Keeps entry diagnostics in stored order, visiting each child before its enclosing text checks. */
        fun walk(node: OrderedNodeWrite, path: String) {
            node.content.orEmpty().forEachIndexed { index, entry ->
                val entryPath = "$path.content[$index]"
                errors += OrderedContentRules.lineBreakErrors(entry.lineBreaksBefore, entry.type, "$entryPath.lineBreaksBefore", entry.logicalId)
                entry.node?.let { walk(it, "$entryPath.node") }
                if (entry.type == "text") {
                    errors += OrderedContentRules.markErrors(entry.text.orEmpty(), entry.format, entry.marks, "$entryPath.marks", entry.logicalId)
                    errors += OrderedContentRules.referenceErrors(entry.text.orEmpty(), entry.format, entry.references, footnotes, entryPath, entry.logicalId, units)
                }
            }
        }
        roots.forEachIndexed { index, root -> walk(root, "roots[$index]") }
        errors += OrderedContentRules.referenceIdentityErrors(positions)
        errors += OrderedContentRules.writeFootnoteMarkerErrors(roots)
        return errors
    }
}

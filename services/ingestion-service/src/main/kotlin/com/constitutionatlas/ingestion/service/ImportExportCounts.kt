package com.constitutionatlas.ingestion.service

import com.constitutionatlas.platform.scalarText
import tools.jackson.databind.JsonNode

/** Counts the persisted ordered tree and separately loaded linked documents for manifest feedback. */
internal object ImportExportCounts {
    /**
     * Includes all roots and descendants in stored order. Only explicit child entries recurse;
     * every other entry contributes to textEntries, retaining the existing read-back contract.
     */
    fun count(roots: JsonNode, documents: Int): Map<String, Int> {
        val counts = mutableMapOf("units" to 0, "textEntries" to 0, "tables" to 0, "cells" to 0, "footnotes" to 0, "references" to 0, "documents" to documents)

        /** Updates a known resource count without allocating a new manifest map. */
        fun increment(key: String, by: Int = 1) {
            counts[key] = counts.getValue(key) + by
        }

        /** Visits child nodes while counting each non-child entry's rich resources once. */
        fun visit(node: JsonNode) {
            increment("units")
            node.path("content").forEach { entry ->
                if (entry.path("type").scalarText() == "child") {
                    visit(entry.path("node"))
                } else {
                    increment("textEntries")
                    increment("references", entry.path("references").size())
                    if (entry.path("format").scalarText() == "footnote") increment("footnotes")
                    if (entry.path("format").scalarText() == "table") {
                        increment("tables")
                        entry.path("table").path("rows").forEach { row -> increment("cells", row.path("cells").size()) }
                    }
                }
            }
        }
        roots.forEach(::visit)
        return counts
    }
}

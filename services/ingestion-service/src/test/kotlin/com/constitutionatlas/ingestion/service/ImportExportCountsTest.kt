package com.constitutionatlas.ingestion.service

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper

class ImportExportCountsTest {
    private val mapper = jacksonObjectMapper()

    @Test
    fun `all resource categories include nested nodes rich entries and external documents`() {
        val roots = mapper.readTree(
            """[
              {"content":[
                {"type":"text","references":[{},{}]},
                {"type":"child","node":{"content":[
                  {"type":"text","format":"table","table":{"rows":[{"cells":[{},{}]},{"cells":[{}]}]}},
                  {"type":"text","format":"footnote","references":[{}]}
                ]}}
              ]},
              {"content":[{"type":"unknown","references":[{}]}]}
            ]""",
        )
        assertEquals(mapOf("units" to 3, "textEntries" to 4, "tables" to 1, "cells" to 3, "footnotes" to 1, "references" to 4, "documents" to 2), ImportExportCounts.count(roots, 2))
    }

    @Test
    fun `missing roots retain every zero resource category`() {
        assertEquals(mapOf("units" to 0, "textEntries" to 0, "tables" to 0, "cells" to 0, "footnotes" to 0, "references" to 0, "documents" to 0), ImportExportCounts.count(mapper.readTree("{}"), 0))
    }

    @Test
    fun `counts do not retain state across read back requests`() {
        assertEquals(1, ImportExportCounts.count(mapper.readTree("[{}]"), 4)["units"])
        assertEquals(0, ImportExportCounts.count(mapper.readTree("[]"), 0)["units"])
        assertEquals(0, ImportExportCounts.count(mapper.readTree("[]"), 0)["documents"])
    }
}

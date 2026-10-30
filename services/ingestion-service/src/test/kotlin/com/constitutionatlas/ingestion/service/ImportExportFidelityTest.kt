package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.FidelityMismatch
import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.SourceEvidence
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.util.UUID

class ImportExportFidelityTest {
    private val mapper = jacksonObjectMapper()
    private val fidelity = ImportExportFidelity(mapper)
    private val versionId = UUID.randomUUID()
    private val constitutionId = UUID.randomUUID()
    private val settingsId = UUID.randomUUID()
    private val request = ImportRequest(
        constitutionSlug = "fidelity",
        constitutionTitle = "Constitution",
        versionLabel = "1",
        sourceUrl = "https://example.org/source",
        constitutionId = constitutionId,
        settingsRevisionId = settingsId,
        roots = listOf(OrderedNodeWrite(kind = "article")),
    )
    private val snapshot = OrderedSnapshot(versionId, 1, settingsId, emptyList())
    private val version = DownstreamVersion(versionId, constitutionId, versionLabel = "1", sourceUrl = request.sourceUrl, languageCode = "en")

    @Test
    fun `fidelity diagnostics retain metadata content and manifest order`() {
        val expected = roots("""[{"kind":"article","label":"expected"}]""")
        val actual = roots("""[{"kind":"article","label":"actual"}]""")
        val input = request.copy(expectedCounts = linkedMapOf("units" to 3, "documents" to 0))
        val persisted = version.copy(constitutionId = UUID.randomUUID(), sourceUrl = "https://example.org/changed", sourceEvidence = SourceEvidence(description = "Added"), versionLabel = "2")
        assertEquals(
            listOf(
                FidelityMismatch("/constitutionId", "Prepared constitution pin differs"),
                FidelityMismatch("/source", "Prepared source pins differ"),
                FidelityMismatch("/sourceEvidence", "Prepared source evidence differs"),
                FidelityMismatch("/version", "Prepared version metadata differs"),
                FidelityMismatch("/settingsRevisionId", "Prepared settings pin differs from submitted pin"),
                FidelityMismatch("/roots/0/label", "Persisted value differs from submitted value"),
                FidelityMismatch("/counts/units", "Expected 3; persisted 1"),
                FidelityMismatch("/counts/documents", "Expected 0; persisted 0"),
            ),
            fidelity.mismatches(input, expected, actual, snapshot.copy(settingsRevisionId = UUID.randomUUID()), persisted, mapOf("units" to 1, "documents" to 0), false),
        )
    }

    @Test
    fun `unpinned constitution and settings do not constrain generated persisted identities`() {
        assertTrue(fidelity.mismatches(request.copy(constitutionId = null, settingsRevisionId = null), roots("[]"), roots("[]"), snapshot.copy(settingsRevisionId = null), version.copy(constitutionId = UUID.randomUUID()), emptyMap(), true).isEmpty())
    }

    @Test
    fun `directional defaults accept generated ancestry identity and omitted optional fields`() {
        val expected = """[{"kind":null,"logicalId":null,"revisionId":"old","predecessorRevisionId":"old","lineage":["old"],"format":null,"optional":null,"optionalNull":null,"items":[],"lineBreaksBefore":0}]"""
        val actual = """[{"kind":"article","logicalId":"generated","revisionId":"new","predecessorRevisionId":"new","lineage":[],"format":"plain","optionalNull":null,"extra":"retained"}]"""
        assertTrue(compare(expected, actual).isEmpty())
    }

    @Test
    fun `null table text accepts the persisted derived projection`() {
        assertTrue(compare("""[{"format":"table","text":null}]""", """[{"format":"table","text":"Derived cell text"}]""").isEmpty())
        assertEquals(listOf(FidelityMismatch("/roots/0/text", "Persisted value differs from submitted value")), compare("""[{"format":"plain","text":null}]""", """[{"format":"plain","text":"Additional wording"}]"""))
    }

    @Test
    fun `historical omitted separator errors precede ordinary text discrepancies`() {
        assertEquals(
            listOf(
                FidelityMismatch("/roots/0/lineBreaksBefore", "Persisted separator differs from the historical default zero"),
                FidelityMismatch("/roots/0/text", "Persisted value differs from submitted value"),
            ),
            compare("""[{"type":"text","text":"Expected"}]""", """[{"type":"text","text":"Actual","lineBreaksBefore":2}]"""),
        )
        assertTrue(compare("""[{"type":"text"}]""", """[{"type":"text","lineBreaksBefore":0}]""").isEmpty())
        assertEquals(listOf(FidelityMismatch("/roots/0/lineBreaksBefore", "Persisted value differs from submitted value")), compare("""[{"lineBreaksBefore":2}]""", "[{}]"))
    }

    @Test
    fun `array length discrepancy precedes each changed or missing submitted item`() {
        assertEquals(
            listOf(
                FidelityMismatch("/roots", "Collection length differs: expected 2, persisted 1"),
                FidelityMismatch("/roots/0", "Persisted value differs from submitted value"),
                FidelityMismatch("/roots/1", "Persisted value differs from submitted value"),
            ),
            compare("[1,2]", "[9]"),
        )
        assertEquals(listOf(FidelityMismatch("/roots", "Collection length differs: expected 0, persisted 0")), compare("[]", "{}"))
        assertEquals(listOf(FidelityMismatch("/roots/0/a/b~c", "Persisted value differs from submitted value")), compare("""[{"a/b~c":1}]""", """[{"a/b~c":2}]"""))
    }

    @Test
    fun `matching persisted metadata includes complete source evidence`() {
        val evidence = SourceEvidence(description = "Exact provenance")
        assertTrue(fidelity.mismatches(request.copy(sourceEvidence = evidence), roots("[]"), roots("[]"), snapshot, version.copy(sourceEvidence = evidence), emptyMap(), true).isEmpty())
    }

    @Test
    fun `submitted view still reports manifest discrepancies and unavailable document counts`() {
        val input = request.copy(expectedCounts = linkedMapOf("units" to 2, "documents" to 0, "unsupported" to 0))
        assertEquals(
            listOf(
                FidelityMismatch("/counts/units", "Expected 2; persisted 1"),
                FidelityMismatch("/counts/documents", "Expected 0; persisted 0"),
                FidelityMismatch("/counts/unsupported", "Expected 0; persisted 0"),
            ),
            fidelity.mismatches(input, roots("[]"), roots("[]"), null, null, mapOf("units" to 1, "documents" to 0), false),
        )
        assertTrue(fidelity.mismatches(request.copy(expectedCounts = mapOf("documents" to 0)), roots("[]"), roots("[]"), null, null, mapOf("documents" to 0), true).isEmpty())
    }

    @Test
    fun `missing prepared catalog version remains a conflict`() {
        val failure = assertThrows(ResponseStatusException::class.java) { fidelity.mismatches(request, roots("[]"), roots("[]"), snapshot, null, emptyMap(), true) }
        assertEquals(409, failure.statusCode.value())
        assertEquals("Prepared catalog version is unavailable", failure.reason)
    }

    @Test
    fun `legacy content compares its canonical ordered projection`() {
        val legacy = request.copy(roots = emptyList(), articles = listOf(ImportArticle("I", "Title", "Exact wording", 1)))
        val projected = mapper.createObjectNode().set("roots", mapper.valueToTree<JsonNode>(legacyImportRoots(legacy.articles)))
        assertTrue(fidelity.mismatches(legacy, mapper.valueToTree(legacy), projected, snapshot, version, emptyMap(), true).isEmpty())
    }

    @Test
    fun `full discrepancy list is retained beyond the public page cap`() {
        val result = compare((1..101).joinToString(prefix = "[", postfix = "]"), "[]")
        assertEquals(102, result.size)
        assertEquals("/roots/100", result.last().path)
    }

    /** Wraps arbitrary ordered-root JSON without involving DTO serialization defaults. */
    private fun roots(json: String): JsonNode = mapper.createObjectNode().set("roots", mapper.readTree(json))

    /** Compares content with matching persisted metadata so only directional JSON behavior is observed. */
    private fun compare(expected: String, actual: String): List<FidelityMismatch> = fidelity.mismatches(request, roots(expected), roots(actual), snapshot, version, emptyMap(), true)
}

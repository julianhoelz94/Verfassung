package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.FidelityMismatch
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.scalarText
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper

/** Compares submitted content with read-back data using the established directional default rules. */
internal class ImportExportFidelity(private val mapper: ObjectMapper) {
    /**
     * Collects source/version pins, ordered content and manifest discrepancies in that order.
     * The full list is retained so the caller can distinguish an exact 100 findings from truncation.
     * Submitted view skips persisted comparisons but still checks requested manifest counts.
     */
    fun mismatches(
        request: ImportRequest,
        submitted: JsonNode,
        tree: JsonNode,
        snapshot: OrderedSnapshot?,
        version: DownstreamVersion?,
        counts: Map<String, Int>,
        resourcesComplete: Boolean,
    ): List<FidelityMismatch> = buildList {
        if (snapshot != null) {
            if (version == null) throw ResponseStatusException(HttpStatus.CONFLICT, "Prepared catalog version is unavailable")
            addAll(metadataMismatches(request, snapshot, version))
            val expectedRoots = if (request.roots.isNotEmpty()) submitted.path("roots") else mapper.valueToTree<JsonNode>(legacyImportRoots(request.articles))
            compare(expectedRoots, tree.path("roots"), "/roots", this)
        }
        request.expectedCounts?.forEach { (key, expected) ->
            if (counts[key] != expected || key == "documents" && !resourcesComplete) add(FidelityMismatch("/counts/$key", "Expected $expected; persisted ${counts[key] ?: 0}"))
        }
    }

    /** Source metadata precedes settings and content discrepancies in public read-back feedback. */
    private fun metadataMismatches(request: ImportRequest, snapshot: OrderedSnapshot, version: DownstreamVersion): List<FidelityMismatch> = buildList {
        if (request.constitutionId != null && version.constitutionId != request.constitutionId) add(FidelityMismatch("/constitutionId", "Prepared constitution pin differs"))
        if (version.sourceUrl != request.sourceUrl || version.gazetteReference != request.gazetteReference) add(FidelityMismatch("/source", "Prepared source pins differ"))
        if (version.sourceEvidence != request.sourceEvidence) add(FidelityMismatch("/sourceEvidence", "Prepared source evidence differs"))
        if (version.effectiveDate != request.effectiveDate || version.versionLabel != request.versionLabel || version.languageCode != request.languageCode || version.predecessorVersionId != request.predecessorVersionId) add(FidelityMismatch("/version", "Prepared version metadata differs"))
        if (request.settingsRevisionId != null && snapshot.settingsRevisionId != request.settingsRevisionId) add(FidelityMismatch("/settingsRevisionId", "Prepared settings pin differs from submitted pin"))
    }

    /** Objects compare submitted fields only; arrays report length changes before per-index changes. */
    private fun compare(expected: JsonNode, actual: JsonNode, path: String, result: MutableList<FidelityMismatch>) {
        when {
            expected.isObject -> compareObject(expected, actual, path, result)
            expected.isArray -> {
                if (!actual.isArray || expected.size() != actual.size()) result += FidelityMismatch(path, "Collection length differs: expected ${expected.size()}, persisted ${actual.size()}")
                expected.forEachIndexed { index, value -> compare(value, actual.path(index), "$path/$index", result) }
            }
            expected != actual -> result += FidelityMismatch(path, "Persisted value differs from submitted value")
        }
    }

    /** Historical omitted separators mean zero; that diagnostic precedes the submitted field walk. */
    private fun compareObject(expected: JsonNode, actual: JsonNode, path: String, result: MutableList<FidelityMismatch>) {
        if (expected.path("type").scalarText() == "text" && expected.path("lineBreaksBefore").isMissingNode && actual.path("lineBreaksBefore").let { it.isIntegralNumber && it.intValue() != 0 }) {
            result += FidelityMismatch("$path/lineBreaksBefore", "Persisted separator differs from the historical default zero")
        }
        expected.properties().forEach { (key, value) ->
            if (!ignoredField(key, value)) {
                val found = actual.path(key)
                if (!sameDefault(expected, key, value, found)) compare(value, found, "$path/$key", result)
            }
        }
    }

    /** Persisted ancestry and generated logical identities are not authored fidelity requirements. */
    private fun ignoredField(key: String, value: JsonNode): Boolean = key in setOf("revisionId", "predecessorRevisionId", "lineage") || (key == "logicalId" && value.isNull)

    /** Accepts only the historical defaults; nonzero separators and nonempty arrays still compare. */
    private fun sameDefault(expected: JsonNode, key: String, value: JsonNode, found: JsonNode): Boolean =
        (value.isNull && (found.isMissingNode || found.isNull)) ||
            (key == "format" && value.isNull && found.scalarText() == "plain") ||
            (key == "text" && value.isNull && expected.path("format").scalarText() == "table") ||
            (key == "kind" && value.isNull) ||
            (key == "lineBreaksBefore" && value.isIntegralNumber && value.intValue() == 0 && found.isMissingNode) ||
            (value.isArray && value.isEmpty && found.isMissingNode)
}

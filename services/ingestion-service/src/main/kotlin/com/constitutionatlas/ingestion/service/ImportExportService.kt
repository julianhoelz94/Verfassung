package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ExportValue
import com.constitutionatlas.ingestion.api.FidelityMismatch
import com.constitutionatlas.ingestion.api.ImportExportPage
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.client.MigrationDomainClient
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID

@Service
class ImportExportService(
    private val jobs: ImportJobRepository,
    private val content: ContentClient,
    private val catalog: CatalogClient,
    private val mapper: ObjectMapper,
    @Value("\${ingestion.publish.token:}") private val serviceToken: String,
    private val domains: MigrationDomainClient? = null,
) {
    fun export(id: UUID, actor: Actor, view: String, cursor: String?, authorization: String? = null): ImportExportPage {
        val job = jobs.find(id) ?: throw NotFoundException("Unknown import job")
        if (actor.id != job.submittedBy && actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") }) {
            throw ForbiddenException("Import job access requires ownership or staff role")
        }
        if (actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") } && "ingestion:import" !in actor.scopes) throw ForbiddenException("Import read-back requires an import scope or staff role")
        requireInput(view in setOf("submitted", "prepared"), "view must be submitted or prepared")
        val request = jobs.request(id) ?: throw NotFoundException("Import payload missing")
        val submitted = mapper.valueToTree<JsonNode>(request)
        val snapshot = if (view == "prepared") {
            val version = job.versionId ?: conflict("Import has no prepared persisted snapshot; use submitted view")
            if (serviceToken.isBlank()) throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Import read-back service credential is not configured")
            // The version comes exclusively from the authorized job, never from caller input.
            DownstreamAuth.withAuthorization("Bearer $serviceToken") { content.snapshot(version) }
        } else {
            null
        }
        val persistedVersion = snapshot?.let { DownstreamAuth.withAuthorization("Bearer $serviceToken") { catalog.version(it.versionId) } }
        val linkedResources = if (snapshot != null && domains != null) domains.importLinks(id, snapshot.versionId, authorization) else mapper.createArrayNode()
        val resourcesComplete = snapshot != null && domains != null && linkedResources?.isArray == true
        val tree = snapshot?.let {
            mapper.valueToTree<com.fasterxml.jackson.databind.node.ObjectNode>(it).also { value ->
                value.set<JsonNode>("sourcePins", mapper.valueToTree(persistedVersion))
                value.set<JsonNode>("linkedDocuments", linkedResources ?: mapper.createArrayNode())
            }
        } ?: submitted
        val serialized = mapper.writeValueAsBytes(tree)
        val snapshotId = MessageDigest.getInstance("SHA-256").digest(serialized).joinToString("") { "%02x".format(it) }
        val records = mutableListOf<ExportValue>()
        flatten(tree, "", records)
        val offset = if (cursor == null) {
            0
        } else {
            val decoded = runCatching { String(Base64.getUrlDecoder().decode(cursor)) }.getOrElse { bad("Invalid export cursor") }
            val parts = decoded.split(':')
            requireInput(parts.size == 4 && parts[0] == id.toString() && parts[1] == view, "Cursor belongs to another export")
            if (parts[2] != snapshotId) conflict("Persisted snapshot changed; restart export")
            parts[3].toIntOrNull() ?: bad("Invalid export offset")
        }
        requireInput(offset in 0..records.size, "Invalid export offset")
        val page = mutableListOf<ExportValue>()
        var bytes = 0
        for (record in records.drop(offset)) {
            val size = mapper.writeValueAsBytes(record).size
            if (page.isNotEmpty() && (bytes + size > 128 * 1024 || page.size >= 200)) break
            page += record
            bytes += size
        }
        val next = offset + page.size
        val mismatches = mutableListOf<FidelityMismatch>()
        if (snapshot != null) {
            if (persistedVersion == null) conflict("Prepared catalog version is unavailable")
            if (request.constitutionId != null && persistedVersion.constitutionId != request.constitutionId) mismatches += FidelityMismatch("/constitutionId", "Prepared constitution pin differs")
            if (persistedVersion.sourceUrl != request.sourceUrl || persistedVersion.gazetteReference != request.gazetteReference) mismatches += FidelityMismatch("/source", "Prepared source pins differ")
            if (persistedVersion.sourceEvidence != request.sourceEvidence) mismatches += FidelityMismatch("/sourceEvidence", "Prepared source evidence differs")
            if (persistedVersion.effectiveDate != request.effectiveDate || persistedVersion.versionLabel != request.versionLabel || persistedVersion.languageCode != request.languageCode || persistedVersion.predecessorVersionId != request.predecessorVersionId) mismatches += FidelityMismatch("/version", "Prepared version metadata differs")
            if (request.settingsRevisionId != null && snapshot.settingsRevisionId != request.settingsRevisionId) mismatches += FidelityMismatch("/settingsRevisionId", "Prepared settings pin differs from submitted pin")
            val expectedRoots = if (request.roots.isNotEmpty()) submitted.path("roots") else mapper.valueToTree<JsonNode>(legacyImportRoots(request.articles))
            compare(expectedRoots, tree.path("roots"), "/roots", mismatches)
        }
        val counts = count(tree.path("roots"), linkedResources?.size() ?: 0)
        request.expectedCounts?.forEach { (key, expected) ->
            if (counts[key] != expected || key == "documents" && !resourcesComplete) mismatches += FidelityMismatch("/counts/$key", "Expected $expected; persisted ${counts[key] ?: 0}")
        }
        return ImportExportPage(
            id, view, snapshotId, job.versionId, snapshot?.generation, snapshot?.settingsRevisionId ?: request.settingsRevisionId,
            mapOf("sourceEvidence" to (if (snapshot != null) persistedVersion?.sourceEvidence else request.sourceEvidence), "sourceUrl" to (if (snapshot != null) persistedVersion?.sourceUrl else request.sourceUrl), "gazetteReference" to (if (snapshot != null) persistedVersion?.gazetteReference else request.gazetteReference), "predecessorVersionId" to (if (snapshot != null) persistedVersion?.predecessorVersionId else request.predecessorVersionId)),
            page, records.size,
            if (next < records.size) Base64.getUrlEncoder().withoutPadding().encodeToString("$id:$view:$snapshotId:$next".toByteArray()) else null,
            next == records.size, mismatches.take(100), snapshot != null && resourcesComplete && mismatches.size <= 100, job.errors, counts, resourcesComplete,
        )
    }

    private fun count(roots: JsonNode, documents: Int): Map<String, Int> {
        val counts = mutableMapOf("units" to 0, "textEntries" to 0, "tables" to 0, "cells" to 0, "footnotes" to 0, "references" to 0, "documents" to documents)
        fun increment(key: String, by: Int = 1) {
            counts[key] = counts.getValue(key) + by
        }
        fun visit(node: JsonNode) {
            increment("units")
            node.path("content").forEach { entry ->
                if (entry.path("type").asText() == "child") {
                    visit(entry.path("node"))
                } else {
                    increment("textEntries")
                    increment("references", entry.path("references").size())
                    if (entry.path("format").asText() == "footnote") increment("footnotes")
                    if (entry.path("format").asText() == "table") {
                        increment("tables")
                        entry.path("table").path("rows").forEach { row -> increment("cells", row.path("cells").size()) }
                    }
                }
            }
        }
        roots.forEach(::visit)
        return counts
    }

    private fun flatten(node: JsonNode, path: String, result: MutableList<ExportValue>) {
        when {
            node.isObject && !node.isEmpty -> node.fields().forEachRemaining { (key, value) -> flatten(value, "$path/${key.replace("~", "~0").replace("/", "~1")}", result) }
            node.isArray && !node.isEmpty -> node.forEachIndexed { index, value -> flatten(value, "$path/$index", result) }
            node.isTextual && node.textValue().length > 16000 -> {
                val text = node.textValue()
                var start = 0
                var index = 0
                while (start < text.length) {
                    var end = minOf(start + 16000, text.length)
                    if (end < text.length && text[end - 1].isHighSurrogate() && text[end].isLowSurrogate()) end--
                    result += ExportValue("$path/@text/${index++}", mapper.valueToTree(text.substring(start, end)))
                    start = end
                }
            }
            else -> result += ExportValue(path, node)
        }
    }

    private fun compare(expected: JsonNode, actual: JsonNode, path: String, result: MutableList<FidelityMismatch>) {
        if (expected.isObject) {
            expected.fields().forEachRemaining { (key, value) ->
                if (key !in setOf("revisionId", "predecessorRevisionId", "lineage") && !(key == "logicalId" && value.isNull)) {
                    val found = actual.path(key)
                    val sameDefault = (value.isNull && (found.isMissingNode || found.isNull)) ||
                        (key == "format" && value.isNull && found.asText() == "plain") ||
                        (key == "text" && value.isNull && expected.path("format").asText() == "table") ||
                        (key == "kind" && value.isNull) ||
                        (value.isArray && value.isEmpty && found.isMissingNode)
                    if (!sameDefault) compare(value, found, "$path/$key", result)
                }
            }
        } else if (expected.isArray) {
            if (!actual.isArray || expected.size() != actual.size()) result += FidelityMismatch(path, "Collection length differs: expected ${expected.size()}, persisted ${actual.size()}")
            expected.forEachIndexed { index, value -> compare(value, actual.path(index), "$path/$index", result) }
        } else if (expected != actual) {
            result += FidelityMismatch(path, "Persisted value differs from submitted value")
        }
    }

    private fun requireInput(condition: Boolean, message: String) {
        if (!condition) bad(message)
    }
    private fun bad(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)
    private fun conflict(message: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, message)
}

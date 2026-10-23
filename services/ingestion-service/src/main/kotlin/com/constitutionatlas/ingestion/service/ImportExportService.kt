package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.*
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
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
) {
    fun export(id: UUID, actor: Actor, view: String, cursor: String?): ImportExportPage {
        val job = jobs.find(id) ?: throw NotFoundException("Unknown import job")
        if (actor.id != job.submittedBy && actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") }) {
            throw ForbiddenException("Import job access requires ownership or staff role")
        }
        requireInput(view in setOf("submitted", "prepared"), "view must be submitted or prepared")
        val request = jobs.request(id) ?: throw NotFoundException("Import payload missing")
        val submitted = mapper.valueToTree<JsonNode>(request)
        val snapshot = if (view == "prepared") {
            val version = job.versionId ?: conflict("Import has no prepared persisted snapshot; use submitted view")
            if (serviceToken.isBlank()) throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Import read-back service credential is not configured")
            // The version comes exclusively from the authorized job, never from caller input.
            DownstreamAuth.withAuthorization("Bearer $serviceToken") { content.snapshot(version) }
        } else null
        val tree = snapshot?.let { mapper.valueToTree<JsonNode>(it) } ?: submitted
        val serialized = mapper.writeValueAsBytes(tree)
        val snapshotId = MessageDigest.getInstance("SHA-256").digest(serialized).joinToString("") { "%02x".format(it) }
        val records = mutableListOf<ExportValue>()
        flatten(tree, "", records)
        val offset = if (cursor == null) 0 else {
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
        val persistedVersion = snapshot?.let { DownstreamAuth.withAuthorization("Bearer $serviceToken") { catalog.version(it.versionId) } }
        if (snapshot != null) {
            if (persistedVersion == null) conflict("Prepared catalog version is unavailable")
            if (request.constitutionId != null && persistedVersion.constitutionId != request.constitutionId) mismatches += FidelityMismatch("/constitutionId", "Prepared constitution pin differs")
            if (persistedVersion.sourceUrl != request.sourceUrl || persistedVersion.gazetteReference != request.gazetteReference) mismatches += FidelityMismatch("/source", "Prepared source pins differ")
            if (persistedVersion.effectiveDate != request.effectiveDate || persistedVersion.versionLabel != request.versionLabel) mismatches += FidelityMismatch("/version", "Prepared version metadata differs")
            if (request.settingsRevisionId != null && snapshot.settingsRevisionId != request.settingsRevisionId) mismatches += FidelityMismatch("/settingsRevisionId", "Prepared settings pin differs from submitted pin")
            if (request.roots.isNotEmpty()) compare(submitted.path("roots"), tree.path("roots"), "/roots", mismatches)
            else mismatches += FidelityMismatch("/articles", "Legacy article import requires structured roots for complete fidelity verification")
        }
        return ImportExportPage(
            id, view, snapshotId, job.versionId, snapshot?.generation, snapshot?.settingsRevisionId ?: request.settingsRevisionId,
            mapOf("sourceUrl" to (if (snapshot != null) persistedVersion?.sourceUrl else request.sourceUrl), "gazetteReference" to (if (snapshot != null) persistedVersion?.gazetteReference else request.gazetteReference), "predecessorVersionId" to request.predecessorVersionId),
            page, records.size,
            if (next < records.size) Base64.getUrlEncoder().withoutPadding().encodeToString("$id:$view:$snapshotId:$next".toByteArray()) else null,
            next == records.size, mismatches.take(100), mismatches.size <= 100, job.errors,
        )
    }

    private fun flatten(node: JsonNode, path: String, result: MutableList<ExportValue>) {
        when {
            node.isObject && !node.isEmpty -> node.fields().forEachRemaining { (key, value) -> flatten(value, "$path/${key.replace("~", "~0").replace("/", "~1")}", result) }
            node.isArray && !node.isEmpty -> node.forEachIndexed { index, value -> flatten(value, "$path/$index", result) }
            node.isTextual && node.textValue().length > 16000 -> {
                val text = node.textValue()
                text.chunked(16000).forEachIndexed { index, part -> result += ExportValue("$path/@text/$index", mapper.valueToTree(part)) }
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
                        (value.isArray && value.isEmpty && found.isMissingNode)
                    if (!sameDefault) compare(value, found, "$path/$key", result)
                }
            }
        } else if (expected.isArray) {
            if (!actual.isArray || expected.size() != actual.size()) result += FidelityMismatch(path, "Collection length differs: expected ${expected.size()}, persisted ${actual.size()}")
            expected.forEachIndexed { index, value -> compare(value, actual.path(index), "$path/$index", result) }
        } else if (expected != actual) result += FidelityMismatch(path, "Persisted value differs from submitted value")
    }

    private fun requireInput(condition: Boolean, message: String) { if (!condition) bad(message) }
    private fun bad(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)
    private fun conflict(message: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, message)
}

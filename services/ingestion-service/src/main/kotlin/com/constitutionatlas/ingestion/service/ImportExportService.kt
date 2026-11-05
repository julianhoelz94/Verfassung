package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportExportPage
import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.ingestion.client.MigrationDomainClient
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.OrderedSnapshot
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.ObjectNode
import java.util.UUID

/** Authorized import read-back with lossless records, snapshot pins and directional fidelity checks. */
@Service
class ImportExportService(
    private val jobs: ImportJobRepository,
    private val content: ContentClient,
    private val catalog: CatalogClient,
    private val mapper: ObjectMapper,
    @Value("\${ingestion.publish.token:}") private val serviceToken: String,
    private val domains: MigrationDomainClient? = null,
) {
    private val records = ImportExportRecords(mapper)
    private val fidelity = ImportExportFidelity(mapper)

    /**
     * Authorizes before reading payloads or downstream data, then returns one snapshot-bound page.
     * Submitted views never claim persisted fidelity. Prepared views use only the authorized job's
     * version and the service credential; linked resources retain the caller's authorization.
     */
    fun export(id: UUID, actor: Actor, view: String, cursor: String?, authorization: String? = null): ImportExportPage {
        val job = jobs.find(id) ?: throw NotFoundException("Unknown import job")
        authorize(job, actor)
        if (view !in setOf("submitted", "prepared")) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "view must be submitted or prepared")
        val request = jobs.request(id) ?: throw NotFoundException("Import payload missing")
        val submitted = mapper.valueToTree<JsonNode>(request)
        val snapshot = preparedSnapshot(job, view)
        val persistedVersion = snapshot?.let { DownstreamAuth.withAuthorization("Bearer $serviceToken") { catalog.version(it.versionId) } }
        val linkedResources = if (snapshot != null && domains != null) domains.importLinks(id, snapshot.versionId, authorization) else mapper.createArrayNode()
        val resourcesComplete = snapshot != null && domains != null && linkedResources?.isArray == true
        val tree = exportTree(submitted, snapshot, persistedVersion, linkedResources)
        val page = records.page(id, view, cursor, tree)
        val counts = ImportExportCounts.count(tree.path("roots"), linkedResources?.size() ?: 0)
        val mismatches = fidelity.mismatches(request, submitted, tree, snapshot, persistedVersion, counts, resourcesComplete)
        return ImportExportPage(
            jobId = id,
            view = view,
            snapshotId = page.snapshotId,
            versionId = job.versionId,
            generation = snapshot?.generation,
            settingsRevisionId = snapshot?.settingsRevisionId ?: request.settingsRevisionId,
            source = sourcePins(request, snapshot, persistedVersion),
            records = page.records,
            totalRecords = page.totalRecords,
            nextCursor = page.nextCursor,
            complete = page.complete,
            fidelity = mismatches.take(100),
            fidelityComplete = snapshot != null && resourcesComplete && mismatches.size <= 100,
            validationErrors = job.errors,
            counts = counts,
            resourcesComplete = resourcesComplete,
        )
    }

    /** Ownership or a staff role grants visibility; owners without a staff role still need import scope. */
    private fun authorize(job: ImportJobDto, actor: Actor) {
        val staff = actor.roles.any { it in setOf("editor", "reviewer", "publisher", "admin") }
        if (actor.id != job.submittedBy && !staff) throw ForbiddenException("Import job access requires ownership or staff role")
        if (!staff && "ingestion:import" !in actor.scopes) throw ForbiddenException("Import read-back requires an import scope or staff role")
    }

    /** A submitted view never calls Content; prepared reads require a version before checking credentials. */
    private fun preparedSnapshot(job: ImportJobDto, view: String): OrderedSnapshot? {
        if (view != "prepared") return null
        val version = job.versionId ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Import has no prepared persisted snapshot; use submitted view")
        if (serviceToken.isBlank()) throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Import read-back service credential is not configured")
        return DownstreamAuth.withAuthorization("Bearer $serviceToken") { content.snapshot(version) }
    }

    /** Preserves serialized snapshot field order, appending source pins and linked documents for hashing. */
    private fun exportTree(submitted: JsonNode, snapshot: OrderedSnapshot?, version: DownstreamVersion?, linkedResources: JsonNode?): JsonNode =
        snapshot?.let {
            mapper.valueToTree<ObjectNode>(it).also { value ->
                value.set("sourcePins", mapper.valueToTree(version))
                value.set("linkedDocuments", linkedResources ?: mapper.createArrayNode())
            }
        } ?: submitted

    /** Prepared source metadata comes from Catalog, including null values, rather than the submitted pins. */
    private fun sourcePins(request: ImportRequest, snapshot: OrderedSnapshot?, version: DownstreamVersion?): Map<String, Any?> =
        if (snapshot == null) {
            mapOf("sourceEvidence" to request.sourceEvidence, "sourceUrl" to request.sourceUrl, "gazetteReference" to request.gazetteReference, "predecessorVersionId" to request.predecessorVersionId)
        } else {
            mapOf("sourceEvidence" to version?.sourceEvidence, "sourceUrl" to version?.sourceUrl, "gazetteReference" to version?.gazetteReference, "predecessorVersionId" to version?.predecessorVersionId)
        }
}

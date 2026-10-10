package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportBatchDto
import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.StageBatchItemRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.security.MessageDigest
import java.util.UUID

@Service
class ImportService(
    private val importJobRepository: ImportJobRepository,
    private val catalogClient: CatalogClient,
    private val contentClient: ContentClient,
    private val objectMapper: ObjectMapper,
    @Value("\${ingestion.publish.token:}") private val publishToken: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    fun importVersion(authorization: String?, submittedBy: UUID, request: ImportRequest, batchId: UUID? = null, idempotencyKey: String? = null, expectedChecksum: String? = null): ImportJobDto {
        if (idempotencyKey != null && idempotencyKey.length !in 8..128) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency key must contain 8 to 128 characters")
        val checksum = MessageDigest.getInstance("SHA-256").digest(objectMapper.writeValueAsBytes(request)).joinToString("") { "%02x".format(it) }
        if (expectedChecksum != null && !checksum.equals(expectedChecksum, ignoreCase = true)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Payload checksum mismatch")
        }
        if (idempotencyKey != null) {
            val previous = if (batchId == null) importJobRepository.findDirectItem(submittedBy, idempotencyKey) else importJobRepository.findBatchItem(batchId, idempotencyKey)
            previous?.let { (existing, previousChecksum) ->
                if (previousChecksum != checksum) throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was used for different content")
                return existing
            }
        }
        val jobId = try {
            importJobRepository.insertPending(request, submittedBy, batchId, idempotencyKey, checksum)
        } catch (ex: DuplicateKeyException) {
            val existing = if (idempotencyKey == null) {
                null
            } else if (batchId == null) {
                importJobRepository.findDirectItem(submittedBy, idempotencyKey)
            } else {
                importJobRepository.findBatchItem(batchId, idempotencyKey)
            }
            if (existing?.second == checksum) return existing.first
            throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was used for different content")
        }
        importJobRepository.stage(jobId, "request", request)

        val needsOutline = request.roots.isNotEmpty() || request.articles.any { it.nodes.isNotEmpty() }
        val pinnedOutline = if (needsOutline && request.constitutionId != null && request.settingsRevisionId != null) {
            DownstreamAuth.withAuthorization(authorization) { catalogClient.settingsOutline(request.constitutionId, request.settingsRevisionId) }
        } else {
            null
        }
        val validation = ImportValidator.validate(request, pinnedOutline)
        if (validation.isNotEmpty()) {
            importJobRepository.fail(jobId, validation)
            return importJobRepository.find(jobId)!!
        }

        return importJobRepository.find(jobId)!!
    }

    fun getJob(jobId: UUID): ImportJobDto? = importJobRepository.find(jobId)

    fun createBatch(ownerId: UUID): ImportBatchDto {
        val id = importJobRepository.createBatch(ownerId)
        return ImportBatchDto(id, emptyList(), "receiving")
    }

    fun getBatch(batchId: UUID, actorId: UUID): ImportBatchDto {
        val owner = importJobRepository.batchOwner(batchId) ?: throw com.constitutionatlas.platform.NotFoundException("Unknown or expired import batch")
        if (owner != actorId) throw com.constitutionatlas.platform.ForbiddenException("Import batch belongs to another principal")
        val items = importJobRepository.batchItems(batchId)
        val status = if (items.isEmpty()) {
            "receiving"
        } else if (items.all { it.status == "completed" }) {
            "completed"
        } else {
            "in_progress"
        }
        return ImportBatchDto(batchId, items, status)
    }

    @Transactional
    fun stageBatchItem(authorization: String?, batchId: UUID, actorId: UUID, item: StageBatchItemRequest): ImportJobDto {
        val key = item.idempotencyKey.trim()
        if (key.length !in 8..128) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "idempotencyKey must contain 8 to 128 characters")
        val owner = importJobRepository.batchOwnerForUpdate(batchId) ?: throw com.constitutionatlas.platform.NotFoundException("Unknown or expired import batch")
        if (owner != actorId) throw com.constitutionatlas.platform.ForbiddenException("Import batch belongs to another principal")
        if (importJobRepository.findBatchItem(batchId, key) == null && importJobRepository.batchItems(batchId).size >= 100) {
            throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Batch item limit is 100")
        }
        return importVersion(authorization, actorId, item.payload, batchId, key, item.checksumSha256)
    }

    fun listJobs(status: String?): List<ImportJobDto> = importJobRepository.list(status)

    fun stagedRequest(jobId: UUID): ImportRequest? = importJobRepository.request(jobId)

    fun confirmOutline(authorization: String?, jobId: UUID, actorId: UUID): ImportJobDto {
        val request = importJobRepository.request(jobId) ?: throw com.constitutionatlas.platform.NotFoundException("Unknown import job")
        if (request.outline?.kinds.isNullOrEmpty()) throw ResponseStatusException(HttpStatus.CONFLICT, "Import has no proposed outline")
        DownstreamAuth.withAuthorization(authorization) {
            if (catalogClient.findConstitution(request.isoCode.trim().uppercase(), request.constitutionSlug) != null) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Constitution already exists; discover and pin its settings revision")
            }
        }
        if (!importJobRepository.confirmOutline(jobId, actorId)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not awaiting outline confirmation")
        return importJobRepository.find(jobId)!!
    }

    fun prepare(authorization: String?, jobId: UUID, actorId: UUID): ImportJobDto {
        val request = importJobRepository.request(jobId) ?: throw com.constitutionatlas.platform.NotFoundException("Unknown import job")
        DownstreamAuth.withAuthorization(authorization) {
            val existing = catalogClient.findConstitution(request.isoCode.trim().uppercase(), request.constitutionSlug)
            if (existing == null && !importJobRepository.isOutlineConfirmed(jobId)) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "An editor must confirm the new constitution outline before preparation")
            }
            if (existing != null && request.settingsRevisionId != catalogClient.currentSettingsRevisionId(existing.id)) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Settings revision changed; rediscover the constitution layout")
            }
            if (existing != null && request.constitutionId != null && request.constitutionId != existing.id) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Constitution ID does not match the selected country and slug")
            }
        }
        if (!importJobRepository.claimPreparation(jobId, actorId)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not awaiting preparation")
        try {
            DownstreamAuth.withAuthorization(authorization) { persistDraft(jobId, request) }
        } catch (ex: RuntimeException) {
            importJobRepository.fail(jobId, listOf("PREPARATION_FAILED" to (ex.message ?: "draft preparation failed")))
        }
        return importJobRepository.find(jobId)!!
    }

    private fun reviewReason(reason: String): String = reason.trim().also {
        if (it.length !in 10..2000) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Review reason must contain 10 to 2000 characters")
    }

    fun approve(authorization: String?, jobId: UUID, actorId: UUID, reason: String): ImportJobDto {
        val recordedReason = reviewReason(reason)
        val versionId = importJobRepository.find(jobId)?.versionId
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Import has no prepared draft")
        val snapshot = DownstreamAuth.withAuthorization(authorization) { contentClient.snapshot(versionId) }
        if (!importJobRepository.approve(jobId, actorId, snapshot, recordedReason)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not prepared or cannot be self-approved")
        return importJobRepository.find(jobId)!!
    }

    fun reject(jobId: UUID, actorId: UUID, reason: String): ImportJobDto {
        if (!importJobRepository.reject(jobId, actorId, reviewReason(reason))) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not pending or cannot be self-rejected")
        return importJobRepository.find(jobId)!!
    }

    fun reviewDecisions(jobId: UUID): List<com.constitutionatlas.ingestion.api.ReviewDecisionDto> = importJobRepository.reviewDecisions(jobId)

    fun publish(authorization: String?, jobId: UUID, actorId: UUID): ImportJobDto {
        if (!importJobRepository.claimPublication(jobId, actorId)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not approved or cannot be self-published")
        val versionId = importJobRepository.find(jobId)?.versionId ?: error("Prepared version missing")
        try {
            val approved = importJobRepository.approvedFingerprint(jobId) ?: error("Approved revision missing")
            val current = DownstreamAuth.withAuthorization(authorization) { contentClient.snapshot(versionId) }
            if (current.generation != approved.first || current.settingsRevisionId != approved.second) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Prepared content or layout changed after approval")
            }
            if (publishToken.isBlank()) throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Import publication token is not configured")
            DownstreamAuth.withAuthorization("Bearer $publishToken") { catalogClient.publishVersion(versionId, jobId) }
            importJobRepository.complete(jobId, versionId, actorId)
        } catch (ex: RuntimeException) {
            try {
                if (publishedVersionStatus(versionId) != "published") importJobRepository.publishFailed(jobId)
            } catch (lookupError: RuntimeException) {
                log.warn("Publication state lookup failed for import {}; scheduled reconciliation will retry", jobId, lookupError)
            }
            throw ex
        }
        return importJobRepository.find(jobId)!!
    }

    @Scheduled(initialDelay = 120_000, fixedDelay = 60_000)
    fun reconcilePublications() {
        for (job in importJobRepository.stalePublications()) {
            try {
                val versionId = job.versionId ?: error("Publishing import has no version")
                if (publishedVersionStatus(versionId) == "published") {
                    importJobRepository.complete(job.id, versionId, job.publishedBy ?: error("Publishing actor missing"))
                } else {
                    importJobRepository.publishFailed(job.id)
                }
            } catch (ex: RuntimeException) {
                log.warn("Import publication reconciliation failed for {}", job.id, ex)
            }
        }
    }

    private fun publishedVersionStatus(versionId: UUID): String? =
        DownstreamAuth.withAuthorization("Bearer $publishToken") { catalogClient.version(versionId)?.publicationStatus }

    private fun persistDraft(jobId: UUID, request: ImportRequest) {
        val iso = request.isoCode.trim().uppercase()
        if (catalogClient.getCountry(iso) == null) {
            catalogClient.createCountry(iso, request.countryName.trim())
        }
        val existing = catalogClient.findConstitution(iso, request.constitutionSlug)
        if (request.constitutionId != null && request.constitutionId != existing?.id) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Constitution ID does not match the selected country and slug")
        }
        if (existing != null) {
            if (request.outline != null) throw ResponseStatusException(HttpStatus.CONFLICT, "Existing constitution settings must be edited and confirmed in the site")
            val revision = catalogClient.currentSettingsRevisionId(existing.id)
            if (request.settingsRevisionId != revision) throw ResponseStatusException(HttpStatus.CONFLICT, "Settings revision changed; rediscover the constitution layout")
        } else if (request.outline?.kinds.isNullOrEmpty()) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "New constitution requires a confirmed outline proposal")
        }
        val constitution = existing ?: catalogClient.createConstitution(iso, request.constitutionSlug, request.constitutionTitle)
        if (existing == null) request.outline?.let { catalogClient.replaceOutline(constitution.id, it.kinds) }
        val version = catalogClient.createDraftVersion(
            constitution.id,
            request.versionLabel.trim(),
            request.effectiveDate,
            request.languageCode,
            request.sourceUrl,
            request.gazetteReference,
            request.predecessorVersionId,
            request.hopKind,
            jobId,
            request.settingsRevisionId,
        )
        try {
            if (request.roots.isNotEmpty()) {
                contentClient.replaceRoots(version.id, request.roots)
            } else {
                contentClient.replaceArticles(version.id, request.articles)
            }
        } catch (ex: RuntimeException) {
            throw ex
        }
        importJobRepository.prepared(jobId, version.id)
    }
}

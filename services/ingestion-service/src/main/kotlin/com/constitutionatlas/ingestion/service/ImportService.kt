package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.ImportBatchDto
import com.constitutionatlas.ingestion.api.StageBatchItemRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import org.springframework.stereotype.Service
import org.springframework.beans.factory.annotation.Value
import java.util.UUID
import java.security.MessageDigest
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.http.HttpStatus
import org.springframework.dao.DuplicateKeyException
import org.springframework.web.server.ResponseStatusException

@Service
class ImportService(
    private val importJobRepository: ImportJobRepository,
    private val catalogClient: CatalogClient,
    private val contentClient: ContentClient,
    private val objectMapper: ObjectMapper,
    @Value("\${ingestion.publish.token:}") private val publishToken: String,
) {
    fun importVersion(submittedBy: UUID, request: ImportRequest, batchId: UUID? = null, idempotencyKey: String? = null, expectedChecksum: String? = null): ImportJobDto {
        val checksum = MessageDigest.getInstance("SHA-256").digest(objectMapper.writeValueAsBytes(request)).joinToString("") { "%02x".format(it) }
        if (expectedChecksum != null && !checksum.equals(expectedChecksum, ignoreCase = true)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Payload checksum mismatch")
        }
        if (batchId != null && idempotencyKey != null) {
            importJobRepository.findBatchItem(batchId, idempotencyKey)?.let { (existing, previousChecksum) ->
                if (previousChecksum != checksum) throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was used for different content")
                return existing
            }
        }
        val jobId = try {
            importJobRepository.insertPending(request, submittedBy, batchId, idempotencyKey, checksum)
        } catch (ex: DuplicateKeyException) {
            val existing = if (batchId != null && idempotencyKey != null) importJobRepository.findBatchItem(batchId, idempotencyKey) else null
            if (existing?.second == checksum) return existing.first
            throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was used for different content")
        }
        importJobRepository.stage(jobId, "request", request)

        val validation = ImportValidator.validate(request)
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
        val status = if (items.isEmpty()) "receiving" else if (items.all { it.status == "completed" }) "completed" else "in_progress"
        return ImportBatchDto(batchId, items, status)
    }

    fun stageBatchItem(batchId: UUID, actorId: UUID, item: StageBatchItemRequest): ImportJobDto {
        val key = item.idempotencyKey.trim()
        if (key.length !in 8..128) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "idempotencyKey must contain 8 to 128 characters")
        getBatch(batchId, actorId)
        if (importJobRepository.findBatchItem(batchId, key) == null && importJobRepository.batchItems(batchId).size >= 100) {
            throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Batch item limit is 100")
        }
        return importVersion(actorId, item.payload, batchId, key, item.checksumSha256)
    }

    fun listJobs(status: String?): List<ImportJobDto> = importJobRepository.list(status)

    fun stagedRequest(jobId: UUID): ImportRequest? = importJobRepository.request(jobId)

    fun prepare(authorization: String?, jobId: UUID, actorId: UUID): ImportJobDto {
        val request = importJobRepository.request(jobId) ?: throw com.constitutionatlas.platform.NotFoundException("Unknown import job")
        if (!importJobRepository.claimPreparation(jobId, actorId)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not awaiting preparation")
        try {
            DownstreamAuth.withAuthorization(authorization) { persistDraft(jobId, request) }
        } catch (ex: RuntimeException) {
            importJobRepository.fail(jobId, listOf("PREPARATION_FAILED" to (ex.message ?: "draft preparation failed")))
        }
        return importJobRepository.find(jobId)!!
    }

    fun approve(authorization: String?, jobId: UUID, actorId: UUID): ImportJobDto {
        val versionId = importJobRepository.find(jobId)?.versionId
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Import has no prepared draft")
        val snapshot = DownstreamAuth.withAuthorization(authorization) { contentClient.snapshot(versionId) }
        if (!importJobRepository.approve(jobId, actorId, snapshot)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not prepared or cannot be self-approved")
        return importJobRepository.find(jobId)!!
    }

    fun reject(jobId: UUID, actorId: UUID): ImportJobDto {
        if (!importJobRepository.reject(jobId, actorId)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not pending or cannot be self-rejected")
        return importJobRepository.find(jobId)!!
    }

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
            importJobRepository.complete(jobId, versionId)
        } catch (ex: RuntimeException) {
            importJobRepository.publishFailed(jobId)
            throw ex
        }
        return importJobRepository.find(jobId)!!
    }

    private fun persistDraft(jobId: UUID, request: ImportRequest) {
        val iso = request.isoCode.trim().uppercase()
        if (catalogClient.getCountry(iso) == null) {
            catalogClient.createCountry(iso, request.countryName.trim())
        }
        val constitution = catalogClient.findConstitution(iso, request.constitutionSlug)
            ?: catalogClient.createConstitution(iso, request.constitutionSlug, request.constitutionTitle)
        request.outline?.takeIf { it.kinds.isNotEmpty() }?.let { outline ->
            catalogClient.replaceOutline(constitution.id, outline.kinds)
        }
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

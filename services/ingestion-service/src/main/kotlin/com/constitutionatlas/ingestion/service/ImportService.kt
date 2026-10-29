package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportBatchDto
import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportPublicationException
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.StageBatchItemRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.platform.scalarText
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestClientResponseException
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.ObjectMapper
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

    @Transactional
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
                requireCurrentRichRules(request)
                return existing
            }
        }
        val needsOutline = request.roots.isNotEmpty() || request.articles.any { it.nodes.isNotEmpty() }
        val pinnedOutline = if (needsOutline && request.constitutionId != null && request.settingsRevisionId != null) {
            DownstreamAuth.withAuthorization(authorization) { catalogClient.settingsOutline(request.constitutionId, request.settingsRevisionId) }
        } else {
            null
        }
        val validation = ImportValidator.validate(request, pinnedOutline)
        val jobId = importJobRepository.insertPending(request, submittedBy, batchId, idempotencyKey, checksum) ?: run {
            val existing = if (idempotencyKey == null) {
                null
            } else if (batchId == null) {
                importJobRepository.findDirectItem(submittedBy, idempotencyKey)
            } else {
                importJobRepository.findBatchItem(batchId, idempotencyKey)
            }
            if (existing?.second == checksum) {
                requireCurrentRichRules(request)
                return existing.first
            }
            throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was used for different content")
        }
        importJobRepository.stage(jobId, "request", request)
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

    fun listJobs(status: String?, owner: UUID? = null, archived: Boolean = false, limit: Int = 100, offset: Int = 0): List<ImportJobDto> {
        require(limit in 1..100 && offset >= 0) { "Invalid pagination" }
        return importJobRepository.list(status, limit, owner, archived, offset)
    }

    @Transactional
    fun archive(jobId: UUID, actorId: UUID, archived: Boolean) {
        val job = importJobRepository.find(jobId) ?: throw com.constitutionatlas.platform.NotFoundException("Unknown import job")
        if (job.submittedBy != actorId) throw com.constitutionatlas.platform.ForbiddenException("Not your import")
        if (!importJobRepository.setArchived(jobId, actorId, archived)) throw ResponseStatusException(HttpStatus.CONFLICT, "Only finished imports can be archived")
    }

    fun stagedRequest(jobId: UUID): ImportRequest? = importJobRepository.request(jobId)

    fun confirmOutline(authorization: String?, jobId: UUID, actorId: UUID): ImportJobDto {
        val request = importJobRepository.request(jobId) ?: throw com.constitutionatlas.platform.NotFoundException("Unknown import job")
        if (request.outline?.kinds.isNullOrEmpty()) throw ResponseStatusException(HttpStatus.CONFLICT, "Import has no proposed outline")
        DownstreamAuth.withAuthorization(authorization) {
            if (findSelectedConstitution(request) != null) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Constitution already exists; discover and pin its settings revision")
            }
        }
        if (!importJobRepository.confirmOutline(jobId, actorId)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not awaiting outline confirmation")
        return importJobRepository.find(jobId)!!
    }

    fun prepare(authorization: String?, jobId: UUID, actorId: UUID): ImportJobDto {
        val request = importJobRepository.request(jobId) ?: throw com.constitutionatlas.platform.NotFoundException("Unknown import job")
        requireCurrentRichRules(request)
        DownstreamAuth.withAuthorization(authorization) {
            val existing = findSelectedConstitution(request)
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
        if (importJobRepository.find(jobId)?.errors.orEmpty().any { it.code != "PREPARATION_FAILED" }) throw ResponseStatusException(HttpStatus.CONFLICT, "Invalid staged content requires a corrected item with a new source key")
        val attempt = importJobRepository.claimPreparation(jobId, actorId) ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not awaiting preparation")
        try {
            DownstreamAuth.withAuthorization(authorization) { persistDraft(jobId, request, attempt) }
        } catch (ex: RuntimeException) {
            importJobRepository.preparationFailed(jobId, attempt, ex.message ?: "draft preparation failed")
        }
        return importJobRepository.find(jobId)!!
    }

    private fun requireCurrentRichRules(request: ImportRequest) {
        com.constitutionatlas.platform.OrderedContentRules.requireValid(ImportValidator.richContentValidationErrors(request.roots))
    }

    private fun reviewReason(reason: String): String = reason.trim().also {
        if (it.length !in 10..2000) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Review reason must contain 10 to 2000 characters")
    }

    fun approve(authorization: String?, jobId: UUID, actorId: UUID, reason: String): ImportJobDto {
        val recordedReason = reviewReason(reason)
        val versionId = importJobRepository.find(jobId)?.versionId
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Import has no prepared draft")
        val snapshot = DownstreamAuth.withAuthorization(authorization) { contentClient.snapshot(versionId) }
        com.constitutionatlas.platform.OrderedContentRules.requireValid(com.constitutionatlas.platform.OrderedContentRules.contentErrors(snapshot.roots))
        if (!importJobRepository.approve(jobId, actorId, snapshot, recordedReason)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not prepared for review")
        return importJobRepository.find(jobId)!!
    }

    fun reject(jobId: UUID, actorId: UUID, reason: String): ImportJobDto {
        if (!importJobRepository.reject(jobId, actorId, reviewReason(reason))) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not pending review")
        return importJobRepository.find(jobId)!!
    }

    fun reviewDecisions(jobId: UUID): List<com.constitutionatlas.ingestion.api.ReviewDecisionDto> = importJobRepository.reviewDecisions(jobId)

    fun publish(authorization: String?, jobId: UUID, actorId: UUID): ImportJobDto {
        if (publishToken.isBlank()) throw ImportPublicationException(HttpStatus.SERVICE_UNAVAILABLE, "publication_not_configured")
        if (!importJobRepository.claimPublication(jobId, actorId)) throw ResponseStatusException(HttpStatus.CONFLICT, "Import is not approved for publication")
        val versionId = importJobRepository.find(jobId)?.versionId ?: error("Prepared version missing")
        var stage = "verify"
        try {
            val approved = importJobRepository.approvedFingerprint(jobId) ?: error("Approved revision missing")
            val current = DownstreamAuth.withAuthorization(authorization) { contentClient.snapshot(versionId) }
            if (current.generation != approved.first || current.settingsRevisionId != approved.second) {
                throw ImportPublicationException(HttpStatus.CONFLICT, "approved_snapshot_changed")
            }
            com.constitutionatlas.platform.OrderedContentRules.contentErrors(current.roots).firstOrNull()?.let {
                throw ImportPublicationException(HttpStatus.BAD_REQUEST, it.code, it.path, it.logicalId)
            }
            DownstreamAuth.withAuthorization("Bearer $publishToken") {
                stage = "seal"
                contentClient.sealImport(versionId, jobId, approved.first, requireNotNull(approved.second))
                stage = "publish"
                catalogClient.publishVersion(versionId, jobId)
            }
            stage = "complete"
            importJobRepository.complete(jobId, versionId, actorId)
        } catch (ex: RuntimeException) {
            try {
                // Before the catalog publication call, no public state could have
                // changed. Restore approval even when the machine credential is
                // invalid and therefore cannot perform a catalog status lookup.
                if (stage in setOf("verify", "seal") || publishedVersionStatus(versionId) != "published") importJobRepository.publishFailed(jobId)
            } catch (lookupError: RuntimeException) {
                log.warn("Publication state lookup failed for import {}; scheduled reconciliation will retry", jobId, lookupError)
            }
            val failure = when {
                ex is ImportPublicationException -> ex
                ex is RestClientResponseException && stage in setOf("seal", "publish") && ex.statusCode.value() in setOf(401, 403) ->
                    ImportPublicationException(HttpStatus.SERVICE_UNAVAILABLE, "publication_credentials_invalid")
                ex is RestClientResponseException && stage in setOf("seal", "publish") && ex.statusCode.value() == 400 ->
                    publicationValidationFailure(ex)
                ex is RestClientResponseException && ex.statusCode.value() == 409 ->
                    ImportPublicationException(HttpStatus.CONFLICT, "publication_conflict")
                else -> ImportPublicationException(HttpStatus.SERVICE_UNAVAILABLE, "publication_unavailable")
            }
            log.warn("Import publication {} failed at {} ({})", jobId, stage, failure.code)
            throw failure
        }
        return importJobRepository.find(jobId)!!
    }

    /** Only a known validation code and bounded structural identity may leave the service. */
    private fun publicationValidationFailure(ex: RestClientResponseException): ImportPublicationException {
        val allowed = setOf("FOOTNOTE_NOT_AT_END", "FOOTNOTE_MARK_CARDINALITY", "UNIT_REFERENCE_TARGET", "INLINE_REFERENCE", "TEXT_MARK_RANGE", "TEXT_MARK_OVERLAP", "TEXT_MARK_FORMAT", "TEXT_MARK_LIMIT", "TEXT_LINE_BREAKS")
        val body = if (ex.responseBodyAsByteArray.size <= 16_384) runCatching { objectMapper.readTree(ex.responseBodyAsByteArray) }.getOrNull() else null
        val code = body?.path("code")?.scalarText()?.takeIf { it in allowed }
            ?: return ImportPublicationException(HttpStatus.BAD_REQUEST, "publication_validation_failed")
        val candidate = body.path("path").scalarText()
        val safePath = candidate.takeIf { it.length <= 512 && it.matches(Regex("(roots\\[[0-9]+\\]|node\\[[0-9a-fA-F-]{36}\\]\\.text\\[[0-9a-fA-F-]{36}\\])(?:\\.(?:content\\[[0-9]+\\](?:\\.node)?|marks|lineBreaksBefore|references\\[[0-9]+\\]))*")) }
        val logicalId = runCatching { UUID.fromString(body.path("logicalId").scalarText()) }.getOrNull()
        return ImportPublicationException(HttpStatus.BAD_REQUEST, code, safePath, logicalId)
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

    private fun findSelectedConstitution(request: ImportRequest) = request.jurisdictionId?.let {
        catalogClient.getJurisdiction(it)
        catalogClient.findJurisdictionConstitution(it, request.constitutionSlug)
    } ?: if (request.jurisdictionId == null) catalogClient.findConstitution(request.isoCode.trim().uppercase(), request.constitutionSlug) else null

    private fun persistDraft(jobId: UUID, request: ImportRequest, attempt: UUID) {
        val iso = request.isoCode.trim().uppercase()
        if (request.jurisdictionId == null && catalogClient.getCountry(iso) == null) {
            catalogClient.createCountry(iso, request.countryName.trim())
        }
        val existing = findSelectedConstitution(request)
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
        val constitution = existing ?: (request.jurisdictionId?.let { catalogClient.createJurisdictionConstitution(it, request.constitutionSlug, request.constitutionTitle) } ?: catalogClient.createConstitution(iso, request.constitutionSlug, request.constitutionTitle))
        if (existing == null) request.outline?.let { catalogClient.replaceOutline(constitution.id, it.kinds) }
        val reserved = importJobRepository.find(jobId)?.versionId?.let { catalogClient.version(it) }
        if (reserved != null && reserved.publicationStatus != "draft") throw ResponseStatusException(HttpStatus.CONFLICT, "Reserved import snapshot is no longer a draft")
        val version = reserved ?: catalogClient.createDraftVersion(
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
            request.sourceEvidence,
        )
        importJobRepository.reserveVersion(jobId, version.id, attempt)
        if (request.roots.isNotEmpty()) {
            contentClient.replaceRoots(version.id, request.roots, request.predecessorVersionId)
        } else {
            contentClient.replaceArticles(version.id, request.articles)
        }
        importJobRepository.prepared(jobId, version.id, attempt)
    }
}

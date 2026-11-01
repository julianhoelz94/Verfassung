package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.ConstitutionSummary
import com.constitutionatlas.catalog.api.CountrySummary
import com.constitutionatlas.catalog.api.CreateConstitutionRequest
import com.constitutionatlas.catalog.api.CreateCountryRequest
import com.constitutionatlas.catalog.api.CreateVersionRequest
import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.api.OutlineUpdateResult
import com.constitutionatlas.catalog.api.SettingsWrite
import com.constitutionatlas.catalog.api.VersionCreated
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.catalog.repo.JurisdictionRepository
import com.constitutionatlas.catalog.repo.SettingsRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class CatalogWriteService(
    private val catalogRepository: CatalogRepository,
    private val settingsRepository: SettingsRepository,
    private val settingsService: SettingsService,
    private val metadataService: ConstitutionMetadataService,
    private val successorReadiness: com.constitutionatlas.catalog.client.SuccessorReadinessClient,
    private val publishAttempts: com.constitutionatlas.catalog.repo.PublishAttemptRepository,
    private val jurisdictions: JurisdictionRepository,
    private val creationReceipts: com.constitutionatlas.catalog.repo.ConstitutionCreationRepository,
) {
    private val versions = CatalogVersionCreation(catalogRepository, settingsRepository, publishAttempts)

    @Transactional
    fun createCountry(request: CreateCountryRequest): CountrySummary {
        val iso = request.isoCode.trim().uppercase()
        if (!Regex("^[A-Z]{2}$").matches(iso)) {
            throw IllegalArgumentException("isoCode must be two letters")
        }
        if (catalogRepository.findCountrySummary(iso) != null) {
            throw ConflictException("Country '$iso' already exists")
        }
        require(request.name.isNotBlank()) { "Country name is required" }
        try {
            return catalogRepository.insertCountry(iso, request.name.trim())
        } catch (_: DuplicateKeyException) {
            throw ConflictException("Country code or jurisdiction slug already exists", "jurisdiction_exists")
        }
    }

    @Transactional
    fun createConstitution(isoCode: String, request: CreateConstitutionRequest): ConstitutionSummary {
        val country = catalogRepository.findCountrySummary(isoCode)
            ?: throw NotFoundException("Unknown country '$isoCode'")
        return createJurisdictionConstitution(country.id, request)
    }

    @Transactional
    fun createJurisdictionConstitution(jurisdictionId: UUID, request: CreateConstitutionRequest): ConstitutionSummary {
        if (jurisdictions.find(jurisdictionId) == null) throw NotFoundException("Unknown jurisdiction '$jurisdictionId'")
        request.creationAttemptId?.let { attempt ->
            creationReceipts.replay(attempt, jurisdictionId, request)?.let { return it }
        }
        return try {
            val response = createConstitutionRecord(jurisdictionId, request)
            request.creationAttemptId?.let { creationReceipts.record(it, jurisdictionId, request, response) }
            response
        } catch (ex: RuntimeException) {
            // Receipt lookup/mismatch happens before this block. A rejected new attempt has
            // no earlier receipt, and throwing rolls back every write in this transaction.
            if (request.creationAttemptId != null && (ex is IllegalArgumentException || ex is ConflictException || ex is DataIntegrityViolationException)) {
                throw ConflictException("Constitution creation was rejected without saving changes; correct the proposal", "constitution_creation_rejected")
            }
            throw ex
        }
    }

    private fun createConstitutionRecord(jurisdictionId: UUID, request: CreateConstitutionRequest): ConstitutionSummary {
        val slug = request.slug.trim()
        catalogRepository.findConstitutionId(jurisdictionId, slug)?.let {
            throw ConflictException("Constitution '$slug' already exists")
        }
        val predecessor = request.predecessorConstitutionId
        if (predecessor != null && catalogRepository.constitutionJurisdictionId(predecessor) != jurisdictionId) {
            throw ConflictException("Predecessor constitution must belong to the same jurisdiction", "invalid_constitution_predecessor")
        }
        val id = catalogRepository.insertConstitution(jurisdictionId, slug, request.title.trim(), predecessor, request.interim)
        if (!request.outline.isNullOrEmpty()) {
            catalogRepository.replaceOutline(id, normalizeOutline(request.outline))
        }
        val settingsRevisionId = settingsRepository.append(id, catalogRepository.findOutline(id))
        metadataService.initialize(id, jurisdictionId, request.title.trim(), slug)
        val response = ConstitutionSummary(
            id,
            slug,
            request.title.trim(),
            null,
            emptyList(),
            catalogRepository.findOutline(id),
            predecessor,
            request.interim,
            settingsRevisionId = settingsRevisionId,
        )
        return response
    }

    /** Creates or replays a draft reservation inside this service's existing transaction. */
    @Transactional
    fun createDraftVersion(constitutionId: UUID, request: CreateVersionRequest): VersionCreated = versions.create(constitutionId, request)

    fun publishAttempt(id: UUID): VersionCreated {
        val reservation = publishAttempts.find(id) ?: throw NotFoundException("Unknown publish attempt")
        return catalogRepository.findVersionCreated(reservation.versionId) ?: throw NotFoundException("Reserved version missing")
    }

    fun requireImportReservation(version: UUID, attempt: UUID) {
        if (catalogRepository.importHold(version) != attempt || publishAttempts.forVersion(version) != attempt) {
            throw ForbiddenException("Publication attempt does not identify this held import snapshot")
        }
    }

    @Transactional
    fun publishVersion(versionId: UUID, actor: Actor? = null, importJobId: UUID? = null, authorization: String? = null): VersionCreated {
        val hold = catalogRepository.importHold(versionId)
        if (hold != null) {
            if (hold != importJobId || actor == null || "ingestion:publish" !in actor.scopes) {
                throw ForbiddenException("Imported version requires an approved ingestion publication")
            }
        } else if (actor != null && "ingestion:publish" in actor.scopes && actor.roles.none { it == "publisher" || it == "admin" } && "catalog:publish" !in actor.scopes) {
            throw ForbiddenException("Import publication token cannot publish an ordinary version")
        }
        if (catalogRepository.findVersionCreated(versionId) == null) throw NotFoundException("Unknown version '$versionId'")
        val attempt = publishAttempts.forVersion(versionId)
        if (attempt != null) {
            successorReadiness.requireReady(versionId, attempt, settingsRepository.forVersion(versionId).id, authorization)
        } else {
            successorReadiness.requireValidContent(versionId, authorization)
        }
        if (!catalogRepository.publishVersion(versionId)) {
            throw NotFoundException("Unknown version '$versionId'")
        }
        return catalogRepository.findVersionCreated(versionId)
            ?: throw NotFoundException("Unknown version '$versionId'")
    }

    @Transactional
    fun replaceOutline(constitutionId: UUID, kinds: List<OutlineKindWrite>, authorization: String? = null): OutlineUpdateResult {
        if (!catalogRepository.constitutionExists(constitutionId)) {
            throw NotFoundException("Unknown constitution '$constitutionId'")
        }
        settingsService.save(
            constitutionId,
            SettingsWrite(settingsService.current(constitutionId).id, kinds),
            authorization,
        )
        return OutlineUpdateResult(
            catalogRepository.findOutline(constitutionId),
            emptyList(),
        )
    }

    companion object {
        fun canonicalizeHopKind(raw: String?): String {
            val hop = raw?.trim()
            if (hop.isNullOrBlank()) {
                throw IllegalArgumentException("hopKind is required when predecessorVersionId is set")
            }
            return when (hop) {
                "legal", "legal_amendment", "official_errata" -> "legal"
                "editorial_correction" -> "editorial_correction"
                else -> throw IllegalArgumentException("hopKind must be one of: initial, legal, editorial_correction")
            }
        }

        /** Normalizes authored layers and validates graph reachability with stable rejection precedence. */
        fun normalizeOutline(kinds: List<OutlineKindWrite>): List<OutlineKindWrite> = CatalogOutlineNormalization.normalize(kinds)
    }
}

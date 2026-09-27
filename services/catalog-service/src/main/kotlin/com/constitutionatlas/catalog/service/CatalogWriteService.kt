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
import com.constitutionatlas.catalog.repo.SettingsRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class CatalogWriteService(
    private val catalogRepository: CatalogRepository,
    private val settingsRepository: SettingsRepository,
    private val settingsService: SettingsService,
    private val metadataService: ConstitutionMetadataService,
) {
    @Transactional
    fun createCountry(request: CreateCountryRequest): CountrySummary {
        val iso = request.isoCode.trim().uppercase()
        if (iso.length != 2) {
            throw IllegalArgumentException("isoCode must be two letters")
        }
        if (catalogRepository.findCountrySummary(iso) != null) {
            throw ConflictException("Country '$iso' already exists")
        }
        return catalogRepository.insertCountry(iso, request.name.trim())
    }

    @Transactional
    fun createConstitution(isoCode: String, request: CreateConstitutionRequest): ConstitutionSummary {
        val country = catalogRepository.findCountrySummary(isoCode)
            ?: throw NotFoundException("Unknown country '$isoCode'")
        val slug = request.slug.trim()
        catalogRepository.findConstitutionId(country.id, slug)?.let {
            throw ConflictException("Constitution '$slug' already exists")
        }
        val id = catalogRepository.insertConstitution(country.id, slug, request.title.trim())
        if (!request.outline.isNullOrEmpty()) {
            catalogRepository.replaceOutline(id, normalizeOutline(request.outline))
        }
        settingsRepository.append(id, catalogRepository.findOutline(id))
        metadataService.initialize(id, country.id, request.title.trim(), slug)
        return ConstitutionSummary(
            id,
            slug,
            request.title.trim(),
            null,
            emptyList(),
            catalogRepository.findOutline(id),
        )
    }

    @Transactional
    fun createDraftVersion(constitutionId: UUID, request: CreateVersionRequest): VersionCreated {
        if (!catalogRepository.constitutionExists(constitutionId)) {
            throw NotFoundException("Unknown constitution '$constitutionId'")
        }
        val label = request.versionLabel.trim()
        if (catalogRepository.versionLabelExists(constitutionId, label)) {
            throw ConflictException("Version '$label' already exists")
        }

        val predecessorId = request.predecessorVersionId
        val id = UUID.randomUUID()
        val hopKind: String
        val listing: String
        val legalVersionId: UUID
        val legalPredecessorId: UUID?
        val editorialPredecessorId: UUID?

        if (predecessorId == null) {
            if (catalogRepository.listAllVersionIds(constitutionId).isNotEmpty()) {
                throw ConflictException(
                    "predecessorVersionId is required to append to an existing chain",
                    "not_legal_tip",
                )
            }
            hopKind = "initial"
            listing = "public"
            legalVersionId = id
            legalPredecessorId = null
            editorialPredecessorId = null
        } else {
            val hop = canonicalizeHopKind(request.hopKind)
            hopKind = hop
            listing = if (hopKind == "editorial_correction") "staff" else "public"
            val predecessor = catalogRepository.findVersion(predecessorId)
            if (predecessor == null || predecessor.constitutionId != constitutionId) {
                throw ConflictException("Unknown predecessor version", "unknown_predecessor")
            }
            val predecessorLegalId = predecessor.legalVersionId
                ?: throw ConflictException("Unknown predecessor version", "unknown_predecessor")
            when (hopKind) {
                "editorial_correction" -> {
                    val editorialTip = catalogRepository.findEditorialTipId(predecessorLegalId)
                    if (predecessorId != editorialTip) {
                        throw ConflictException(
                            "Predecessor is not the editorial tip of this legal version",
                            "not_editorial_tip",
                        )
                    }
                    legalVersionId = predecessorLegalId
                    legalPredecessorId = null
                    editorialPredecessorId = predecessorId
                }
                "legal" -> {
                    val legalTipEditorial = catalogRepository.findLegalTipEditorialTipId(constitutionId)
                    if (predecessorId != legalTipEditorial) {
                        throw ConflictException(
                            "Predecessor is not the editorial tip of the current legal tip",
                            "not_legal_tip",
                        )
                    }
                    legalVersionId = id
                    legalPredecessorId = predecessorId
                    editorialPredecessorId = null
                }
                else -> throw IllegalArgumentException("hopKind must be one of: legal, editorial_correction")
            }
        }

        try {
            catalogRepository.insertDraftVersion(
                id,
                constitutionId,
                label,
                request.effectiveDate,
                request.languageCode,
                request.sourceUrl,
                request.gazetteReference,
                request.publicationComment?.trim()?.ifBlank { null },
                predecessorId,
                hopKind,
                listing,
                legalVersionId,
                legalPredecessorId,
                editorialPredecessorId,
            )
        } catch (ex: DataIntegrityViolationException) {
            if (hopKind == "editorial_correction") {
                throw ConflictException(
                    "Predecessor is not the editorial tip of this legal version",
                    "not_editorial_tip",
                )
            }
            if (predecessorId != null) {
                throw ConflictException(
                    "Predecessor is not the editorial tip of the current legal tip",
                    "not_legal_tip",
                )
            }
            throw ex
        }

        request.structuralSettingsRevisionId?.let { settingsRepository.find(constitutionId, it) }
        settingsRepository.pin(id, constitutionId, predecessorId, request.structuralSettingsRevisionId)
        return catalogRepository.findVersionCreated(id)
            ?: VersionCreated(id, constitutionId, label, "draft", predecessorId, hopKind, listing, legalVersionId)
    }

    @Transactional
    fun publishVersion(versionId: UUID): VersionCreated {
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
        private val KIND_CODE = Regex("^[a-z][a-z0-9_-]{0,31}$")

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

        fun normalizeOutline(kinds: List<OutlineKindWrite>): List<OutlineKindWrite> {
            if (kinds.isEmpty()) {
                throw IllegalArgumentException("outline must have at least one layer")
            }
            val normalized = kinds.mapIndexed { index, kind ->
                val code = kind.kindCode.trim().lowercase()
                val label = kind.displayLabel.trim()
                val presentation = kind.presentation.trim().lowercase()
                if (!KIND_CODE.matches(code)) {
                    throw IllegalArgumentException("kindCode '$code' must be a lowercase slug")
                }
                if (label.isBlank()) {
                    throw IllegalArgumentException("displayLabel is required for layer ${index + 1}")
                }
                if (presentation != "section" && presentation != "concatenated") {
                    throw IllegalArgumentException("presentation must be section or concatenated")
                }
                if (code == "sentence" && index != kinds.lastIndex) {
                    throw IllegalArgumentException("sentence must be the final layer")
                }
                if (index == kinds.lastIndex && kind.allowTextAlongsideChildren) {
                    throw IllegalArgumentException("the final layer has no child units")
                }
                if (kind.titlePolicy !in setOf("none", "optional", "required") ||
                    kind.labelPolicy !in setOf("none", "optional", "required")
                ) {
                    throw IllegalArgumentException("titlePolicy and labelPolicy must be none, optional or required")
                }
                if (kind.showTitle && kind.titlePolicy == "none") {
                    throw IllegalArgumentException("public title display requires editor title permission")
                }
                if (kind.showLabel && kind.labelPolicy == "none") {
                    throw IllegalArgumentException("public label display requires literal label permission")
                }
                if (kind.labelPlacement !in setOf("before_title", "after_title", "inline")) {
                    throw IllegalArgumentException("labelPlacement must be before_title, after_title or inline")
                }
                if (kind.segmentation !in setOf("plain", "sentence") ||
                    (kind.segmentation == "sentence" && index != kinds.lastIndex)
                ) {
                    throw IllegalArgumentException("sentence segmentation is only available on the final layer")
                }
                kind.copy(
                    kindCode = code,
                    displayLabel = label,
                    presentation = presentation,
                )
            }
            if (normalized.map { it.kindCode }.toSet().size != normalized.size) {
                throw IllegalArgumentException("kindCode values must be unique")
            }
            return normalized
        }
    }
}

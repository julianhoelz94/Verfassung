package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.NotFoundException
import com.constitutionatlas.catalog.api.ConstitutionSummary
import com.constitutionatlas.catalog.api.CountrySummary
import com.constitutionatlas.catalog.api.CreateConstitutionRequest
import com.constitutionatlas.catalog.api.CreateCountryRequest
import com.constitutionatlas.catalog.api.CreateVersionRequest
import com.constitutionatlas.catalog.api.VersionCreated
import com.constitutionatlas.catalog.repo.CatalogRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class CatalogWriteService(private val catalogRepository: CatalogRepository) {
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
        return ConstitutionSummary(id, slug, request.title.trim(), emptyList())
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
        val id = catalogRepository.insertDraftVersion(
            constitutionId,
            label,
            request.effectiveDate,
            request.languageCode,
            request.sourceUrl,
            request.gazetteReference,
        )
        return VersionCreated(id, constitutionId, label, "draft")
    }

    @Transactional
    fun publishVersion(versionId: UUID): VersionCreated {
        if (!catalogRepository.publishVersion(versionId)) {
            throw NotFoundException("Unknown version '$versionId'")
        }
        return catalogRepository.findVersionCreated(versionId)
            ?: throw NotFoundException("Unknown version '$versionId'")
    }
}

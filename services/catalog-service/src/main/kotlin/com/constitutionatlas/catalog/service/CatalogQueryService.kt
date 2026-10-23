package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.api.ConstitutionSummary
import com.constitutionatlas.catalog.api.ContentOutlineDto
import com.constitutionatlas.catalog.api.CountryDetail
import com.constitutionatlas.catalog.api.CountrySummary
import com.constitutionatlas.catalog.api.VersionDetail
import com.constitutionatlas.catalog.api.VersionSummary
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class CatalogQueryService(private val catalogRepository: CatalogRepository, private val settingsService: SettingsService) {
    fun listCountries(): List<CountrySummary> = catalogRepository.listCountries()

    fun getCountry(isoCode: String, includeUnpublished: Boolean = false): CountryDetail {
        val detail = catalogRepository.findCountryDetail(isoCode)
            ?: throw NotFoundException("Unknown country '$isoCode'")
        return detail.copy(constitutions = visibleConstitutions(detail.constitutions, includeUnpublished))
    }

    fun constitutions(jurisdictionId: UUID, includeUnpublished: Boolean = false): List<ConstitutionSummary> =
        visibleConstitutions(catalogRepository.listConstitutions(jurisdictionId), includeUnpublished)

    private fun visibleConstitutions(
        constitutions: List<ConstitutionSummary>,
        includeUnpublished: Boolean,
    ): List<ConstitutionSummary> {
        if (includeUnpublished) return constitutions
        return constitutions.filter { it.versions.isNotEmpty() }.map { constitution ->
            constitution.copy(contentOutline = settingsService.forVersion(constitution.versions.firstOrNull { it.latestPublished }?.id ?: constitution.versions.last().id).outline)
        }
    }

    fun publicVersionId(constitutionId: UUID): UUID? = catalogRepository.listPublishedPublicVersions(constitutionId).let { versions ->
        versions.firstOrNull { it.latestPublished }?.id ?: versions.lastOrNull()?.id
    }

    fun listVersions(constitutionId: UUID): List<VersionSummary> {
        if (!catalogRepository.constitutionExists(constitutionId)) {
            throw NotFoundException("Unknown constitution '$constitutionId'")
        }
        return catalogRepository.listPublishedPublicVersions(constitutionId)
    }

    fun listAllPublishedVersions(constitutionId: UUID): List<VersionSummary> {
        if (!catalogRepository.constitutionExists(constitutionId)) {
            throw NotFoundException("Unknown constitution '$constitutionId'")
        }
        return catalogRepository.listAllPublishedVersions(constitutionId)
    }

    // Listing controls discovery; every published snapshot retains its public permalink (ADR 0005).
    fun getVersion(versionId: UUID, includeUnpublished: Boolean = false): VersionDetail =
        catalogRepository.findVersion(versionId)
            ?.takeIf { includeUnpublished || it.publicationStatus == "published" }
            ?: throw NotFoundException("Unknown version '$versionId'")

    fun getOutline(constitutionId: UUID): ContentOutlineDto {
        if (!catalogRepository.constitutionExists(constitutionId)) {
            throw NotFoundException("Unknown constitution '$constitutionId'")
        }
        return catalogRepository.findOutline(constitutionId)
    }
}

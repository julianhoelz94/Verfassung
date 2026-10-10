package com.constitutionatlas.catalog.service

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
        if (includeUnpublished) return detail
        return detail.copy(
            constitutions = detail.constitutions.filter { it.versions.isNotEmpty() }.map { constitution ->
                constitution.copy(contentOutline = settingsService.forVersion(constitution.versions.firstOrNull { it.latestPublished }?.id ?: constitution.versions.last().id).outline)
            },
        )
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

    fun getVersion(versionId: UUID): VersionDetail =
        catalogRepository.findVersion(versionId)
            ?: throw NotFoundException("Unknown version '$versionId'")

    fun getOutline(constitutionId: UUID): ContentOutlineDto {
        if (!catalogRepository.constitutionExists(constitutionId)) {
            throw NotFoundException("Unknown constitution '$constitutionId'")
        }
        return catalogRepository.findOutline(constitutionId)
    }
}

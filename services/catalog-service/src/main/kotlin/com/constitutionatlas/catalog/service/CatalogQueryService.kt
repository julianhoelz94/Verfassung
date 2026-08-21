package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.NotFoundException
import com.constitutionatlas.catalog.api.CountryDetail
import com.constitutionatlas.catalog.api.CountrySummary
import com.constitutionatlas.catalog.api.VersionSummary
import com.constitutionatlas.catalog.repo.CatalogRepository
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class CatalogQueryService(private val catalogRepository: CatalogRepository) {
    fun listCountries(): List<CountrySummary> = catalogRepository.listCountries()

    fun getCountry(isoCode: String): CountryDetail =
        catalogRepository.findCountryDetail(isoCode)
            ?: throw NotFoundException("Unknown country '$isoCode'")

    fun listVersions(constitutionId: UUID): List<VersionSummary> {
        if (!catalogRepository.constitutionExists(constitutionId)) {
            throw NotFoundException("Unknown constitution '$constitutionId'")
        }
        return catalogRepository.listPublishedVersions(constitutionId)
    }
}

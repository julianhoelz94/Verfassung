package com.constitutionatlas.catalog.api

import com.constitutionatlas.catalog.service.CatalogQueryService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class CatalogController(private val catalogQueryService: CatalogQueryService) {
    @GetMapping("/countries")
    fun listCountries(): List<CountrySummary> = catalogQueryService.listCountries()

    @GetMapping("/countries/{isoCode}")
    fun getCountry(@PathVariable isoCode: String): CountryDetail =
        catalogQueryService.getCountry(isoCode)

    @GetMapping("/constitutions/{constitutionId}/versions")
    fun listVersions(@PathVariable constitutionId: UUID): List<VersionSummary> =
        catalogQueryService.listVersions(constitutionId)
}

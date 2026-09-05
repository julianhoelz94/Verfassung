package com.constitutionatlas.catalog.api

import com.constitutionatlas.catalog.service.CatalogQueryService
import com.constitutionatlas.catalog.service.CatalogWriteService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class CatalogController(
    private val catalogQueryService: CatalogQueryService,
    private val catalogWriteService: CatalogWriteService,
) {
    @GetMapping("/countries")
    fun listCountries(): List<CountrySummary> = catalogQueryService.listCountries()

    @GetMapping("/countries/{isoCode}")
    fun getCountry(@PathVariable isoCode: String): CountryDetail =
        catalogQueryService.getCountry(isoCode)

    @GetMapping("/constitutions/{constitutionId}/versions")
    fun listVersions(@PathVariable constitutionId: UUID): List<VersionSummary> =
        catalogQueryService.listVersions(constitutionId)

    @GetMapping("/constitutions/{constitutionId}/content-outline")
    fun getOutline(@PathVariable constitutionId: UUID): ContentOutlineDto =
        catalogQueryService.getOutline(constitutionId)

    @PutMapping("/constitutions/{constitutionId}/content-outline")
    fun putOutline(
        @PathVariable constitutionId: UUID,
        @RequestBody request: ContentOutlineWrite,
    ): OutlineUpdateResult = catalogWriteService.replaceOutline(constitutionId, request.kinds)

    @PostMapping("/countries")
    @ResponseStatus(HttpStatus.CREATED)
    fun createCountry(@RequestBody request: CreateCountryRequest): CountrySummary =
        catalogWriteService.createCountry(request)

    @PostMapping("/countries/{isoCode}/constitutions")
    @ResponseStatus(HttpStatus.CREATED)
    fun createConstitution(
        @PathVariable isoCode: String,
        @RequestBody request: CreateConstitutionRequest,
    ): ConstitutionSummary = catalogWriteService.createConstitution(isoCode, request)

    @PostMapping("/constitutions/{constitutionId}/versions")
    @ResponseStatus(HttpStatus.CREATED)
    fun createVersion(
        @PathVariable constitutionId: UUID,
        @RequestBody request: CreateVersionRequest,
    ): VersionCreated = catalogWriteService.createDraftVersion(constitutionId, request)

    @PostMapping("/versions/{versionId}/publish")
    fun publishVersion(@PathVariable versionId: UUID): VersionCreated =
        catalogWriteService.publishVersion(versionId)
}

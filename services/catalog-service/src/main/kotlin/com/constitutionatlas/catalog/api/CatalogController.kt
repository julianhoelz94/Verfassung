package com.constitutionatlas.catalog.api

import com.constitutionatlas.catalog.client.WriteAccess
import com.constitutionatlas.catalog.service.CatalogQueryService
import com.constitutionatlas.catalog.service.CatalogWriteService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class CatalogController(
    private val catalogQueryService: CatalogQueryService,
    private val catalogWriteService: CatalogWriteService,
    private val writeAccess: WriteAccess,
) {
    @GetMapping("/countries")
    fun listCountries(): List<CountrySummary> = catalogQueryService.listCountries()

    @GetMapping("/countries/{isoCode}")
    fun getCountry(@PathVariable isoCode: String): CountryDetail =
        catalogQueryService.getCountry(isoCode)

    @GetMapping("/constitutions/{constitutionId}/versions")
    fun listVersions(@PathVariable constitutionId: UUID): List<VersionSummary> =
        catalogQueryService.listVersions(constitutionId)

    @GetMapping("/versions/{versionId}")
    fun getVersion(@PathVariable versionId: UUID): VersionDetail =
        catalogQueryService.getVersion(versionId)

    @GetMapping("/constitutions/{constitutionId}/content-outline")
    fun getOutline(@PathVariable constitutionId: UUID): ContentOutlineDto =
        catalogQueryService.getOutline(constitutionId)

    @PutMapping("/constitutions/{constitutionId}/content-outline")
    fun putOutline(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable constitutionId: UUID,
        @RequestBody request: ContentOutlineWrite,
    ): OutlineUpdateResult {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.replaceOutline(constitutionId, request.kinds)
    }

    @PostMapping("/countries")
    @ResponseStatus(HttpStatus.CREATED)
    fun createCountry(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: CreateCountryRequest,
    ): CountrySummary {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.createCountry(request)
    }

    @PostMapping("/countries/{isoCode}/constitutions")
    @ResponseStatus(HttpStatus.CREATED)
    fun createConstitution(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable isoCode: String,
        @RequestBody request: CreateConstitutionRequest,
    ): ConstitutionSummary {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.createConstitution(isoCode, request)
    }

    @PostMapping("/constitutions/{constitutionId}/versions")
    @ResponseStatus(HttpStatus.CREATED)
    fun createVersion(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable constitutionId: UUID,
        @RequestBody request: CreateVersionRequest,
    ): VersionCreated {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.createDraftVersion(constitutionId, request)
    }

    @PostMapping("/versions/{versionId}/publish")
    fun publishVersion(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable versionId: UUID,
    ): VersionCreated {
        writeAccess.requireCatalogPublisher(authorization)
        return catalogWriteService.publishVersion(versionId)
    }
}

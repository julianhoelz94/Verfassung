package com.constitutionatlas.catalog.api

import com.constitutionatlas.catalog.client.WriteAccess
import com.constitutionatlas.catalog.service.CatalogWriteService
import com.constitutionatlas.catalog.service.JurisdictionService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class JurisdictionController(
    private val jurisdictions: JurisdictionService,
    private val writes: CatalogWriteService,
    private val access: WriteAccess,
) {
    @GetMapping("/jurisdictions")
    fun list(@RequestParam(required = false) parentId: UUID?): List<JurisdictionSummary> = jurisdictions.list(parentId)

    @GetMapping("/jurisdictions/{id}")
    fun get(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): JurisdictionDetail = jurisdictions.get(id, access.mayViewPrivateCatalog(authorization))

    @PostMapping("/jurisdictions")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: CreateJurisdictionRequest,
    ): JurisdictionSummary {
        access.requireCatalogWriter(authorization)
        return jurisdictions.create(request)
    }

    @PostMapping("/jurisdictions/{id}/constitutions")
    @ResponseStatus(HttpStatus.CREATED)
    fun createConstitution(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: CreateConstitutionRequest,
    ): ConstitutionSummary {
        access.requireCatalogWriter(authorization)
        return writes.createJurisdictionConstitution(id, request)
    }
}

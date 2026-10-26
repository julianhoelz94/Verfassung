package com.constitutionatlas.catalog.api

import com.constitutionatlas.catalog.client.WriteAccess
import com.constitutionatlas.catalog.service.LegacyMappingService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class LegacyMappingController(private val mappings: LegacyMappingService, private val access: WriteAccess) {
    @PostMapping("/legacy-mappings")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: LegacyMappingRequest): LegacyMapping = mappings.create(request, access.requireCatalogWriter(authorization).id, authorization)

    @GetMapping("/legacy-resolve")
    fun resolve(@RequestParam url: String): LegacyResolution = mappings.resolve(url)
}

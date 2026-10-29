package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.SwaggerAccessService
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

data class SwaggerAccessDto(val enabled: Boolean)

data class UpdateSwaggerAccessRequest(val enabled: Boolean?)

@RestController
class SwaggerAccessController(private val service: SwaggerAccessService) {
    @GetMapping("/swagger-access")
    fun publicPolicy(): ResponseEntity<SwaggerAccessDto> = ResponseEntity.ok()
        .cacheControl(CacheControl.noStore()).body(service.publicPolicy())

    @GetMapping("/admin/swagger-access")
    fun read(@RequestHeader(value = "Authorization", required = false) authorization: String?): SwaggerAccessDto =
        service.read(authorization)

    @PutMapping("/admin/swagger-access")
    fun update(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: UpdateSwaggerAccessRequest,
    ): SwaggerAccessDto = service.update(authorization, request)
}

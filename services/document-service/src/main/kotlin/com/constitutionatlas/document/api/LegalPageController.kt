package com.constitutionatlas.document.api

import com.constitutionatlas.document.service.LegalPageService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class LegalPageController(private val service: LegalPageService) {
    @GetMapping("/legal-pages/imprint-details")
    fun imprintDetails(): ImprintDetailsDto = service.imprintDetails()

    @GetMapping("/legal-pages/imprint-details/editor")
    fun imprintDetailsEditor(@RequestHeader(value = "Authorization", required = false) authorization: String?): ImprintDetailsStateDto {
        service.admin(authorization)
        return service.imprintDetailsState()
    }

    @PutMapping("/legal-pages/imprint-details/draft")
    fun saveImprintDetails(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: SaveImprintDetailsRequest,
    ): ImprintDetailsStateDto = service.saveImprintDetails(request, service.admin(authorization))

    @PostMapping("/legal-pages/imprint-details/publish")
    fun publishImprintDetails(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: PublishLegalPageRequest,
    ): ImprintDetailsStateDto = service.publishImprintDetails(request, service.admin(authorization))

    @GetMapping("/legal-pages/{key}")
    fun published(@PathVariable key: String): LegalPageRevisionDto = service.published(key)

    @GetMapping("/legal-pages/{key}/editor")
    fun editor(@PathVariable key: String, @RequestHeader(value = "Authorization", required = false) authorization: String?): LegalPageStateDto {
        service.admin(authorization)
        return service.state(key)
    }

    @GetMapping("/legal-pages/{key}/editor/revisions")
    fun revisions(@PathVariable key: String, @RequestHeader(value = "Authorization", required = false) authorization: String?): List<LegalPageRevisionDto> {
        service.admin(authorization)
        return service.history(key)
    }

    @PutMapping("/legal-pages/{key}/draft")
    fun saveDraft(
        @PathVariable key: String,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: SaveLegalPageDraftRequest,
    ): LegalPageStateDto = service.saveDraft(key, request, service.admin(authorization))

    @PostMapping("/legal-pages/{key}/publish")
    fun publish(
        @PathVariable key: String,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: PublishLegalPageRequest,
    ): LegalPageStateDto = service.publish(key, request, service.admin(authorization))
}

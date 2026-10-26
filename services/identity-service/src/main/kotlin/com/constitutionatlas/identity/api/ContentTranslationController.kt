package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.ContentTranslationService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class ContentTranslationController(private val service: ContentTranslationService) {
    @GetMapping("/content-translation/availability")
    fun availability(): Map<String, Boolean> = service.availability()

    @GetMapping("/content-translation/admin")
    fun site(@RequestHeader(value = "Authorization", required = false) authorization: String?): ContentTranslationSiteDto =
        service.site(authorization)

    @PutMapping("/content-translation/admin")
    fun updateSite(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: UpdateContentTranslationSiteRequest,
    ): ContentTranslationSiteDto = service.updateSite(authorization, request)

    @GetMapping("/content-translation/me")
    fun user(@RequestHeader(value = "Authorization", required = false) authorization: String?): ContentTranslationUserDto =
        service.user(authorization)

    @PutMapping("/content-translation/me")
    fun updateUser(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: UpdateContentTranslationUserRequest,
    ): ContentTranslationUserDto = service.updateUser(authorization, request)

    @PostMapping("/content-translation/translate")
    fun translate(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: TranslateContentRequest,
    ): TranslateContentResponse = service.translate(authorization, request)

    @PostMapping("/content-translation/translate-batch")
    fun translateBatch(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: TranslateContentBatchRequest,
    ): TranslateContentBatchResponse = service.translateBatch(authorization, request)
}

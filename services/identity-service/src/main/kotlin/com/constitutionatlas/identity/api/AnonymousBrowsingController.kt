package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.repo.AnonymousBrowsingSettings
import com.constitutionatlas.identity.service.AnonymousBrowsingService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class AnonymousBrowsingController(private val service: AnonymousBrowsingService) {
    @GetMapping("/anonymous-browsing")
    fun publicPolicy(): AnonymousBrowsingSettings = service.publicPolicy()

    @GetMapping("/admin/anonymous-browsing")
    fun read(@RequestHeader(value = "Authorization", required = false) authorization: String?): AnonymousBrowsingSettings =
        service.read(authorization)

    @PutMapping("/admin/anonymous-browsing")
    fun update(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: AnonymousBrowsingSettings,
    ): AnonymousBrowsingSettings = service.update(authorization, request)
}

package com.constitutionatlas.identity.setup

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class SetupController(private val service: SetupService) {
    @GetMapping("/setup/status")
    fun status(): SetupStatus = service.status()

    @GetMapping("/site/languages")
    fun languages(): LanguagePolicy = service.languages()

    @GetMapping("/setup")
    fun read(@RequestHeader(value = "Authorization", required = false) authorization: String?): SetupDetails = service.read(authorization)

    @PutMapping("/setup")
    fun save(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: SetupPreferences): SetupDetails = service.save(authorization, request)

    @PostMapping("/setup/complete")
    fun complete(@RequestHeader(value = "Authorization", required = false) authorization: String?): SetupStatus = service.complete(authorization)
}

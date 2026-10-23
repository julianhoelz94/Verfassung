package com.constitutionatlas.ingestion.api

import com.constitutionatlas.ingestion.client.WriteAccess
import com.constitutionatlas.ingestion.service.MigrationService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class MigrationController(private val migrations: MigrationService, private val access: WriteAccess) {
    @GetMapping("/migration-runs")
    fun list(@RequestHeader(value = "Authorization", required = false) authorization: String?) = migrations.list(access.authenticate(authorization))

    @PostMapping("/migration-runs")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: CreateMigrationRun) = migrations.create(access.requireImporter(authorization), request)

    @GetMapping("/migration-runs/{id}")
    fun get(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID) = migrations.get(id, access.authenticate(authorization))

    @PostMapping("/migration-runs/{id}/items")
    @ResponseStatus(HttpStatus.CREATED)
    fun stage(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID, @RequestBody request: StageMigrationItem) = migrations.stage(id, access.requireImporter(authorization), request, authorization)

    @PostMapping("/migration-runs/{id}/items/{itemId}/prepare")
    fun prepare(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID, @PathVariable itemId: UUID) = migrations.prepare(id, itemId, access.requireEditor(authorization), authorization)
}

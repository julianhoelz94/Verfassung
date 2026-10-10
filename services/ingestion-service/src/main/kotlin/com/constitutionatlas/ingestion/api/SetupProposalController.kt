package com.constitutionatlas.ingestion.api

import com.constitutionatlas.ingestion.client.WriteAccess
import com.constitutionatlas.ingestion.service.SetupProposalService
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
class SetupProposalController(private val service: SetupProposalService, private val access: WriteAccess) {
    @PostMapping("/import-setup-proposals")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: SetupProposalRequest): SetupProposalDto {
        val actor = access.requireImporter(authorization)
        return service.create(authorization, actor.id, request)
    }

    @GetMapping("/import-setup-proposals/{id}")
    fun get(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID): SetupProposalDto {
        val actor = access.requireImporter(authorization)
        return service.get(id, actor.id, "admin" in actor.roles)
    }

    @PutMapping("/import-setup-proposals/{id}")
    fun revise(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID, @RequestBody request: SetupProposalRequest): SetupProposalDto {
        val actor = access.requireImporter(authorization)
        return service.revise(authorization, id, actor.id, "admin" in actor.roles, request)
    }

    @PostMapping("/import-setup-proposals/{id}/confirm")
    fun confirm(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID): SetupProposalDto {
        val actor = access.requireEditor(authorization)
        return service.confirm(authorization, id, actor.id, "admin" in actor.roles)
    }

    @PostMapping("/import-setup-proposals/{id}/withdraw")
    fun withdraw(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID): SetupProposalDto {
        val actor = access.requireImporter(authorization)
        return service.withdraw(id, actor.id, "admin" in actor.roles)
    }
}

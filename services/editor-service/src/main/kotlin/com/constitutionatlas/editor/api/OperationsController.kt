package com.constitutionatlas.editor.api

import com.constitutionatlas.editor.repo.AuditOutboxRepository
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class OperationsController(private val identity: IdentityClient, private val outbox: AuditOutboxRepository) {
    @GetMapping("/operations/status")
    fun status(@RequestHeader(value = "Authorization", required = false) authorization: String?): Map<String, Any> {
        val actor = identity.authenticate(authorization)
        if ("admin" !in actor.roles && "operations:read" !in actor.scopes) throw ForbiddenException("Operational status requires admin or operations:read")
        return mapOf("service" to "editor", "queues" to outbox.statuses())
    }
}

package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.repo.AuditOutboxRepository
import com.constitutionatlas.identity.service.AuthService
import com.constitutionatlas.platform.ForbiddenException
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

@RestController
class OperationsController(private val auth: AuthService, private val outbox: AuditOutboxRepository) {
    @GetMapping("/operations/status")
    fun status(@RequestHeader(value = "Authorization", required = false) authorization: String?): Map<String, Any> {
        val actor = auth.me(authorization)
        if ("admin" !in actor.roles && "operations:read" !in actor.scopes) throw ForbiddenException("Operational status requires admin or operations:read")
        return mapOf("service" to "identity", "queues" to listOf(outbox.status()))
    }
}

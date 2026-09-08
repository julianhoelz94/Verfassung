package com.constitutionatlas.audit.api

import com.constitutionatlas.audit.client.WriteAccess
import com.constitutionatlas.audit.repo.AuditRepository
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class AuditController(
    private val auditRepository: AuditRepository,
    private val writeAccess: WriteAccess,
) {
    @PostMapping("/events")
    @ResponseStatus(HttpStatus.CREATED)
    fun append(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: AppendEventRequest,
    ): AuditEventDto {
        val actor = writeAccess.requireAuditAppender(authorization)
        val attributed =
            if (actor.roles.isEmpty() && "audit:append" in actor.scopes) {
                request
            } else {
                request.copy(actorId = actor.id, actorEmail = actor.email)
            }
        val id = auditRepository.insert(attributed)
        return auditRepository.listByEntity(request.entityType, request.entityId).first { it.id == id }
    }

    @GetMapping("/events")
    fun list(
        @RequestParam entityType: String,
        @RequestParam entityId: UUID,
    ): List<AuditEventDto> = auditRepository.listByEntity(entityType, entityId)

    @PutMapping("/events", "/events/{id}")
    @PatchMapping("/events", "/events/{id}")
    @DeleteMapping("/events", "/events/{id}")
    fun mutationsRejected(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable(required = false) id: UUID?,
    ) {
        writeAccess.requireAuditAppender(authorization)
        throw UnsupportedOperationException("audit_events is append-only")
    }
}

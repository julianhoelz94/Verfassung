package com.constitutionatlas.audit.api

import com.constitutionatlas.audit.repo.AuditRepository
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class AuditController(private val auditRepository: AuditRepository) {
    @PostMapping("/events")
    @ResponseStatus(HttpStatus.CREATED)
    fun append(@RequestBody request: AppendEventRequest): AuditEventDto {
        val id = auditRepository.insert(request)
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
    fun mutationsRejected(@PathVariable(required = false) id: UUID?): Unit =
        throw UnsupportedOperationException("audit_events is append-only")
}

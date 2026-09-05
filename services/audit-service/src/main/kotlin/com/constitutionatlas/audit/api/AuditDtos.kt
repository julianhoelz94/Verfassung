package com.constitutionatlas.audit.api

import java.time.OffsetDateTime
import java.util.UUID

data class AppendEventRequest(
    val actorId: UUID? = null,
    val actorEmail: String? = null,
    val action: String,
    val entityType: String,
    val entityId: UUID,
    val payload: Map<String, Any?>? = null,
)

data class AuditEventDto(
    val id: UUID,
    val occurredAt: OffsetDateTime,
    val actorId: UUID?,
    val actorEmail: String?,
    val action: String,
    val entityType: String,
    val entityId: UUID,
    val payload: String?,
)

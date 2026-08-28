package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.api.Actor
import java.util.UUID

interface AuditClient {
    fun record(actor: Actor, action: String, entityType: String, entityId: UUID, payload: Map<String, Any?> = emptyMap())
}

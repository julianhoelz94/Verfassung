package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.platform.OrderedSnapshot
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class SuccessorReadinessClient(@Value("\${content.api.url}") contentUrl: String) {
    private val client = timedRestClient(contentUrl)
    fun requireReady(version: UUID, attempt: UUID, settings: UUID) {
        val snapshot = client.get().uri("/versions/{version}/publish-receipt?attemptId={attempt}", version, attempt).retrieve().body(OrderedSnapshot::class.java)
        if (snapshot == null || snapshot.versionId != version || snapshot.settingsRevisionId != settings || snapshot.roots.isEmpty()) throw ConflictException("Successor content or settings are incomplete", "content_not_ready")
    }
}

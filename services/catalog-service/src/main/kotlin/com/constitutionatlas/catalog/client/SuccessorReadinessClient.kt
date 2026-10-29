package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.timedRestClient
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientException
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Component
class SuccessorReadinessClient(@Value("\${content.api.url}") contentUrl: String) {
    private val client = timedRestClient(contentUrl)

    /** Ordinary publication has no receipt, but its complete content must satisfy the same rules. */
    fun requireValidContent(version: UUID, authorization: String? = null) {
        val snapshot = try {
            val request = client.get().uri("/versions/{version}/content", version)
            authorization?.let { request.header("Authorization", it) }
            request.retrieve().body(OrderedSnapshot::class.java)
        } catch (ex: RestClientException) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Content validation is unavailable", ex)
        }
        if (snapshot == null || snapshot.versionId != version) throw ConflictException("Publication content is unavailable", "content_not_ready")
        OrderedContentRules.requireValid(OrderedContentRules.contentErrors(snapshot.roots))
    }

    fun requireReady(version: UUID, attempt: UUID, settings: UUID, authorization: String? = null) {
        val request = client.get().uri("/versions/{version}/publish-receipt?attemptId={attempt}", version, attempt)
        authorization?.let { request.header("Authorization", it) }
        val snapshot = request.retrieve().body(OrderedSnapshot::class.java)
        if (snapshot == null || snapshot.versionId != version || snapshot.settingsRevisionId != settings || snapshot.roots.isEmpty()) throw ConflictException("Successor content or settings are incomplete", "content_not_ready")
        OrderedContentRules.requireValid(OrderedContentRules.contentErrors(snapshot.roots))
    }
}

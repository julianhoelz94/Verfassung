package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.api.SettingsUsage
import com.constitutionatlas.catalog.api.SettingsViolation
import com.constitutionatlas.platform.scalarText
import com.constitutionatlas.platform.timedRestClient
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientException
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import java.util.UUID

@Component
class SettingsUsageClient(
    @Value("\${content.api.url:http://localhost/api/content}") contentUrl: String,
    @Value("\${editor.api.url:http://localhost/api/editor}") editorUrl: String,
) {
    private val content = timedRestClient(contentUrl)
    private val editor = timedRestClient(editorUrl)

    /** Reads each persisted version before its authorized drafts, retaining transport and policy failure precedence. */
    fun inspect(versions: List<UUID>, proposed: List<OutlineKindWrite>, authorization: String?): SettingsUsage {
        val violations = mutableListOf<SettingsViolation>()
        val draftIds = mutableListOf<UUID>()
        try {
            versions.forEach { version ->
                val request = content.get().uri("/versions/{id}/content", version)
                authorization?.let { request.header("Authorization", it) }
                val snapshot = request.retrieve().body(JsonNode::class.java)
                    ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Content impact unavailable")
                violations += SettingsImpactRules(version, proposed).inspect(snapshot)
                if (authorization != null) {
                    val sessions = editor.get().uri("/edit-sessions?versionId={id}", version).header("Authorization", authorization).retrieve().body(JsonNode::class.java)
                        ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Draft impact unavailable")
                    sessions.filter { it.path("status").scalarText() != "published" }.forEach { draftIds += UUID.fromString(it.path("id").scalarText()) }
                }
            }
        } catch (ex: RestClientException) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Impact analysis requires content and draft services", ex)
        }
        return SettingsUsage(draftIds.distinct(), violations)
    }
}

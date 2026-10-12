package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.api.SettingsUsage
import com.constitutionatlas.catalog.api.SettingsViolation
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientException
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Component
class SettingsUsageClient(
    @Value("\${content.api.url:http://localhost/api/content}") contentUrl: String,
    @Value("\${editor.api.url:http://localhost/api/editor}") editorUrl: String,
) {
    private val content = timedRestClient(contentUrl)
    private val editor = timedRestClient(editorUrl)

    fun inspect(versions: List<UUID>, proposed: List<OutlineKindWrite>, authorization: String?): SettingsUsage {
        val violations = mutableListOf<SettingsViolation>()
        val draftIds = mutableListOf<UUID>()
        try {
            versions.forEach { version ->
                val snapshot = content.get().uri("/versions/{id}/content", version).retrieve().body(JsonNode::class.java)
                    ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Content impact unavailable")
                val byCode = proposed.associateBy { it.kindCode }
                fun walk(node: JsonNode, parent: OutlineKindWrite?) {
                    val logical = node.path("logicalId").asText().takeIf { it.isNotEmpty() }?.let(UUID::fromString)
                    fun violation(field: String, message: String) {
                        violations += SettingsViolation(version, logical, field, message)
                    }
                    val code = node.path("kind").asText()
                    val level = byCode[code]
                    if (level == null || (parent == null && level.root != true) || (parent != null && code !in parent.allowedChildKinds.orEmpty())) {
                        violation("kind", "Stored '$code' is not allowed ${if (parent == null) "at the root" else "under '${parent.kindCode}'"}")
                        return
                    }
                    val title = node.path("title").takeUnless { it.isNull }?.asText().orEmpty()
                    val label = node.path("label").takeUnless { it.isNull }?.asText().orEmpty()
                    if ((level.titlePolicy == "required" && title.isBlank()) || (level.titlePolicy == "none" && title.isNotEmpty())) violation("title", "Stored title violates the proposed authoring policy")
                    if ((level.labelPolicy == "required" && label.isBlank()) || (level.labelPolicy == "none" && label.isNotEmpty())) violation("label", "Stored literal label violates the proposed policy")
                    node.path("content").forEach { entry ->
                        if (entry.path("type").asText() == "child") {
                            walk(entry.path("node"), level)
                        } else if (level.allowedChildKinds.orEmpty().isNotEmpty() && !level.allowTextAlongsideChildren) {
                            violation("content", "Stored parent text requires permission alongside children")
                        }
                    }
                }
                snapshot.path("roots").forEach { walk(it, null) }
                if (authorization != null) {
                    val sessions = editor.get().uri("/edit-sessions?versionId={id}", version).header("Authorization", authorization).retrieve().body(JsonNode::class.java)
                        ?: throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Draft impact unavailable")
                    sessions.filter { it.path("status").asText() != "published" }.forEach { draftIds += UUID.fromString(it.path("id").asText()) }
                }
            }
        } catch (ex: RestClientException) {
            throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Impact analysis requires content and draft services", ex)
        }
        return SettingsUsage(draftIds.distinct(), violations)
    }
}

package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.api.DraftSource
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientException
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class DraftLevel(val kindCode: String, val mayHoldText: Boolean, val mayHoldChildren: Boolean, val allowedChildKinds: List<String>, val titlePolicy: String = "optional", val labelPolicy: String = "optional")
data class DraftOutline(val kinds: List<DraftLevel>)

@JsonIgnoreProperties(ignoreUnknown = true)
data class DraftSettings(val id: UUID, val outline: DraftOutline)

@Component
class StructuredSourceClient(@Value("\${content.api.url}") contentUrl: String, @Value("\${catalog.api.url}") catalogUrl: String, @Value("\${editor.downstream.bearer:}") private val bearer: String) {
    private val content = timedRestClient(contentUrl)
    private val catalog = timedRestClient(catalogUrl)

    fun source(version: UUID): DraftSource = try {
        content.get().uri("/versions/{id}/content", version)
            .apply { if (bearer.isNotBlank()) header("Authorization", bearerHeader(bearer)) }
            .retrieve().body(DraftSource::class.java)
            ?: throw DownstreamException("Missing ordered source")
    } catch (ex: RestClientException) {
        throw DownstreamException("Ordered source unavailable", ex)
    }

    fun settings(version: UUID): DraftSettings = try {
        catalog.get().uri("/versions/{id}/settings", version).retrieve().body(DraftSettings::class.java)
            ?: throw DownstreamException("Missing version-pinned settings")
    } catch (ex: RestClientException) {
        throw DownstreamException("Pinned settings unavailable", ex)
    }
}

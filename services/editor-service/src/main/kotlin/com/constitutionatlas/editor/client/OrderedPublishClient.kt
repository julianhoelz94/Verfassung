package com.constitutionatlas.editor.client

import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.OrderedSnapshotWrite
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

@Component
class OrderedPublishClient(@Value("\${content.api.url}") contentUrl: String, @Value("\${catalog.api.url}") catalogUrl: String) {
    private val content = timedRestClient(contentUrl)
    private val catalog = timedRestClient(catalogUrl)

    fun reservation(attempt: UUID, authorization: String?): CatalogVersion? = try {
        catalog.get().uri("/publish-attempts/{id}", attempt).headers { headers -> authorization?.let { headers.set("Authorization", it) } }.retrieve().body(CatalogVersion::class.java)
    } catch (ex: RestClientResponseException) {
        if (ex.statusCode == HttpStatus.NOT_FOUND) null else throw ex
    }

    fun reserve(attempt: UUID, source: CatalogVersion, hopKind: String, comment: String?, settings: UUID, authorization: String?): CatalogVersion =
        catalog.post().uri("/constitutions/{id}/versions", source.constitutionId).headers { headers -> authorization?.let { headers.set("Authorization", it) } }.contentType(MediaType.APPLICATION_JSON)
            .body(mapOf("publishAttemptId" to attempt, "versionLabel" to "${source.versionLabel}-${attempt.toString().take(8)}", "effectiveDate" to source.effectiveDate, "languageCode" to source.languageCode, "predecessorVersionId" to source.id, "hopKind" to hopKind, "publicationComment" to comment, "structuralSettingsRevisionId" to settings))
            .retrieve().body(CatalogVersion::class.java) ?: error("Missing reserved successor")

    fun save(version: UUID, request: OrderedSnapshotWrite, authorization: String?): OrderedSnapshot =
        content.put().uri("/versions/{id}/content", version).headers { headers -> authorization?.let { headers.set("Authorization", it) } }.contentType(MediaType.APPLICATION_JSON).body(request).retrieve().body(OrderedSnapshot::class.java) ?: error("Missing successor roots")
}

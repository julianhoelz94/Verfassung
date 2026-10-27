package com.constitutionatlas.ingestion.client

import com.constitutionatlas.platform.scalarText
import com.constitutionatlas.platform.timedRestClient
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode

/** Only the resource operations supported by migration packages are exposed. */
@Component
class MigrationDomainClient(
    @Value("\${document.api.url:http://localhost/api/document}") documentUrl: String,
    @Value("\${amendment.api.url:http://localhost/api/amendment}") amendmentUrl: String,
    @Value("\${catalog.api.url:http://localhost/api/catalog}") catalogUrl: String,
) {
    private val documents = timedRestClient(documentUrl)
    private val amendments = timedRestClient(amendmentUrl)
    private val catalog = timedRestClient(catalogUrl)
    fun importLinks(job: java.util.UUID, version: java.util.UUID, authorization: String?) = documents.get().uri("/import-read-back/{id}/links?versionId={version}", job, version).header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).retrieve().body(JsonNode::class.java)!!
    fun capture(body: Any, authorization: String?) = documents.post().uri("/migration-captures").header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
    fun amendment(constitutionId: java.util.UUID, body: Any, authorization: String?) = amendments.post().uri("/constitutions/{id}/amendments", constitutionId).header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
    fun documentLink(type: String, target: java.util.UUID, body: Map<String, String?>, authorization: String?): JsonNode {
        fun links() = documents.get().uri { builder ->
            builder.path("/links/{type}/{id}").apply { body["scopeRevisionId"]?.let { queryParam("scopeRevisionId", it) } }.build(type, target)
        }.header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).retrieve().body(JsonNode::class.java)!!
        return reconcileDocumentLink(body.getValue("documentId")!!, body.getValue("revisionId")!!, ::links) {
            documents.post().uri("/links/{type}/{id}", type, target).header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
        }
    }
    fun legacyMapping(body: Any, authorization: String?) = catalog.post().uri("/legacy-mappings").header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
    fun comparison(body: Any, authorization: String?) = catalog.post().uri("/curated-comparisons").header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
}

/** A lost response must not turn a committed exact relationship into a permanently failed item. */
internal fun reconcileDocumentLink(document: String, revision: String, read: () -> JsonNode, attach: () -> JsonNode): JsonNode {
    fun matches(links: JsonNode): Boolean = links.any { it.path("documentId").scalarText() == document && it.path("revisionId").scalarText() == revision }
    val existing = read()
    if (matches(existing)) return existing
    return try {
        attach()
    } catch (failure: RuntimeException) {
        val recovered = runCatching(read).getOrNull()
        if (recovered != null && matches(recovered)) recovered else throw failure
    }
}

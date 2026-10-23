package com.constitutionatlas.ingestion.client

import com.constitutionatlas.platform.timedRestClient
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.stereotype.Component

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
    fun capture(body: Any, authorization: String?) = documents.post().uri("/migration-captures").header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
    fun amendment(constitutionId: java.util.UUID, body: Any, authorization: String?) = amendments.post().uri("/constitutions/{id}/amendments", constitutionId).header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
    fun documentLink(type: String, target: java.util.UUID, body: Any, authorization: String?) = documents.post().uri("/links/{type}/{id}", type, target).header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
    fun legacyMapping(body: Any, authorization: String?) = catalog.post().uri("/legacy-mappings").header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
    fun comparison(body: Any, authorization: String?) = catalog.post().uri("/curated-comparisons").header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode::class.java)!!
}

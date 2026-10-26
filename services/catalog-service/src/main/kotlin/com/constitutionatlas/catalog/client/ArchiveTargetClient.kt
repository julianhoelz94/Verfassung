package com.constitutionatlas.catalog.client

import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.timedRestClient
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpHeaders
import java.util.UUID

interface ArchiveTargetClient {
    fun snapshot(version: UUID, authorization: String?): OrderedSnapshot
    fun document(document: UUID, revision: Int, authorization: String?): JsonNode
}
class RestArchiveTargetClient(contentUrl: String, documentUrl: String) : ArchiveTargetClient {
    private val content = timedRestClient(contentUrl)
    private val documents = timedRestClient(documentUrl)
    override fun snapshot(version: UUID, authorization: String?): OrderedSnapshot = content.get().uri("/versions/{id}/content", version).headers { if (authorization != null) it.set(HttpHeaders.AUTHORIZATION, authorization) }.retrieve().body(OrderedSnapshot::class.java)!!
    override fun document(document: UUID, revision: Int, authorization: String?): JsonNode = documents.get().uri("/documents/{id}?revision={revision}", document, revision).headers { if (authorization != null) it.set(HttpHeaders.AUTHORIZATION, authorization) }.retrieve().body(JsonNode::class.java)!!
}

@Configuration
class ArchiveTargetClientConfig {
    @Bean
    @ConditionalOnMissingBean(ArchiveTargetClient::class)
    fun archiveTargetClient(@Value("\${content.api.url}") contentUrl: String, @Value("\${document.api.url:http://localhost/api/document}") documentUrl: String): ArchiveTargetClient = RestArchiveTargetClient(contentUrl, documentUrl)
}

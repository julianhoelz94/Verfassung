package com.constitutionatlas.document.api

import com.constitutionatlas.document.service.DocumentService
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.timedRestClient
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class ImportDocumentReadBackController(
    private val identity: IdentityClient,
    private val documents: DocumentService,
    @Value("\${ingestion.api.url:http://localhost/api/ingestion}") ingestionUrl: String,
) {
    private val ingestion = timedRestClient(ingestionUrl)

    @GetMapping("/import-read-back/{jobId}/links")
    fun links(
        @PathVariable jobId: UUID,
        @RequestParam versionId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<DocumentLinkDto> {
        val actor = identity.authenticate(authorization)
        if (actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") } && "ingestion:import" !in actor.scopes) throw ForbiddenException("Import read-back requires an import scope or staff role")
        // Ingestion authorizes the exact job with the caller's current identity.
        // A leaked version ID alone never grants access to private linked documents.
        val job = ingestion.get().uri("/import-jobs/{id}", jobId).header(HttpHeaders.AUTHORIZATION, authorization.orEmpty()).retrieve().body(JsonNode::class.java)
        if (job?.path("versionId")?.asText() != versionId.toString()) throw NotFoundException("Version does not belong to the authorized import job")
        return documents.currentLinks("version", versionId, null, authorization)
    }
}

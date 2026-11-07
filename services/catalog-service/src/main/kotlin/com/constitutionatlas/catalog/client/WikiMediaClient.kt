package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.WikiCitation
import com.constitutionatlas.catalog.api.WikiImage
import com.constitutionatlas.platform.scalarText
import com.constitutionatlas.platform.timedRestClient
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import tools.jackson.databind.JsonNode
import java.util.UUID

interface WikiMedia {
    fun requirePinnedCitations(targetType: String, targetId: UUID, revisionId: UUID, citations: List<WikiCitation>, authorization: String?) {
        require(citations.isEmpty()) { "Document citations are unavailable" }
    }
    fun requirePinnedImages(targetType: String, targetId: UUID, revisionId: UUID, images: List<WikiImage>, authorization: String?)
}

@Component
class WikiMediaClient(
    @Value("\${document.api.url:http://localhost/api/document}") documentUrl: String,
) : WikiMedia {
    private val documents = timedRestClient(documentUrl)

    override fun requirePinnedCitations(targetType: String, targetId: UUID, revisionId: UUID, citations: List<WikiCitation>, authorization: String?) {
        if (citations.isEmpty()) return
        require(authorization != null) { "Authorization is required" }
        val links = documents.get().uri("/links/${targetType}_wiki/$targetId?scopeRevisionId=$revisionId")
            .header("Authorization", authorization).retrieve().body(JsonNode::class.java)
            ?: throw ConflictException("Wiki citations could not be verified", "wiki_citation_missing")
        citations.forEach { citation ->
            if (!links.any { it.path("documentId").scalarText() == citation.documentId.toString() && it.path("document").path("revision").path("revision").asInt(0) == citation.revision }) {
                throw ConflictException("Wiki citation is not pinned to this draft", "wiki_citation_missing")
            }
        }
    }

    override fun requirePinnedImages(targetType: String, targetId: UUID, revisionId: UUID, images: List<WikiImage>, authorization: String?) {
        if (images.isEmpty()) return
        require(authorization != null) { "Authorization is required" }
        val target = "${targetType}_wiki"
        val links = documents.get()
            .uri("/links/$target/$targetId?scopeRevisionId=$revisionId")
            .header("Authorization", authorization)
            .retrieve()
            .body(JsonNode::class.java)
            ?: throw ConflictException("Wiki images could not be verified", "wiki_image_missing")
        images.forEach { image ->
            if (!links.any { link ->
                    link.path("documentId").scalarText() == image.documentId.toString() &&
                        link.path("document").path("revision").path("revision").asInt(0) == image.revision &&
                        link.path("document").path("revision").path("contentType").scalarText() in
                        setOf("image/png", "image/jpeg", "image/gif", "image/webp", "image/avif") &&
                        link.path("document").path("revision").path("fileName").scalarText().isNotBlank()
                }
            ) {
                throw ConflictException("Wiki image is not pinned to this draft revision", "wiki_image_missing")
            }
        }
    }
}

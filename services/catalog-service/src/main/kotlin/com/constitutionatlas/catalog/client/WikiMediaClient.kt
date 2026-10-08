package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.WikiImage
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.util.UUID

interface WikiMedia {
    fun requirePinnedImages(targetType: String, targetId: UUID, revisionId: UUID, images: List<WikiImage>, authorization: String?)
}

@Component
class WikiMediaClient(
    @Value("\${document.api.url:http://localhost/api/document}") documentUrl: String,
) : WikiMedia {
    private val documents = timedRestClient(documentUrl)

    override fun requirePinnedImages(targetType: String, targetId: UUID, revisionId: UUID, images: List<WikiImage>, authorization: String?) {
        if (images.isEmpty()) return
        require(authorization != null) { "Authorization is required" }
        val target = if (targetType == "country") "country_wiki" else "constitution_wiki"
        val links = documents.get()
            .uri("/links/$target/$targetId?scopeRevisionId=$revisionId")
            .header("Authorization", authorization)
            .retrieve()
            .body(JsonNode::class.java)
            ?: throw ConflictException("Wiki images could not be verified", "wiki_image_missing")
        images.forEach { image ->
            if (!links.any { link ->
                    link.path("documentId").asText() == image.documentId.toString() &&
                        link.path("document").path("revision").path("revision").asInt() == image.revision
                }
            ) {
                throw ConflictException("Wiki image is not pinned to this draft revision", "wiki_image_missing")
            }
        }
    }
}

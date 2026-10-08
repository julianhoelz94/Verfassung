package com.constitutionatlas.document.service

import com.constitutionatlas.platform.NotFoundException
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

interface LinkTargetClient {
    fun requireTarget(targetType: String, targetId: UUID, authorization: String?)
    fun isPublic(targetType: String, targetId: UUID, scopeRevisionId: UUID?): Boolean
    fun requireAmendmentRevision(targetId: UUID, scopeRevisionId: UUID, authorization: String?, allowPublished: Boolean)
    fun amendmentAncestry(targetId: UUID, scopeRevisionId: UUID, authorization: String?): List<UUID>
    fun publishedAmendmentRevision(targetId: UUID): UUID?
    fun requireWikiRevision(targetType: String, targetId: UUID, scopeRevisionId: UUID, authorization: String?)
}

@Component
class RestLinkTargetClient(
    @Value("\${catalog.api.url:http://localhost/api/catalog}") catalogUrl: String,
    @Value("\${amendment.api.url:http://localhost/api/amendment}") amendmentUrl: String,
) : LinkTargetClient {
    private val catalog = timedRestClient(catalogUrl)
    private val amendment = timedRestClient(amendmentUrl)

    override fun requireTarget(targetType: String, targetId: UUID, authorization: String?) {
        val (client, path) = when (targetType) {
            "constitution" -> catalog to "/constitutions/$targetId/metadata"
            "version" -> catalog to "/versions/$targetId"
            "amendment" -> amendment to "/amendments/$targetId"
            "country_wiki" -> catalog to "/wiki/country/$targetId/draft"
            "constitution_wiki" -> catalog to "/wiki/constitution/$targetId/draft"
            else -> throw IllegalArgumentException("Unsupported link target")
        }
        try {
            val call = client.get().uri(path)
            val response = if (authorization != null) call.header("Authorization", authorization) else call
            response.retrieve().toBodilessEntity()
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) throw NotFoundException("Link target not found")
            throw ex
        }
    }

    override fun isPublic(targetType: String, targetId: UUID, scopeRevisionId: UUID?): Boolean =
        runCatching {
            when (targetType) {
                "constitution" -> {
                    val versions = catalog.get().uri("/constitutions/$targetId/versions").retrieve().body(JsonNode::class.java)
                    versions?.isArray == true && versions.size() > 0
                }
                "version" -> {
                    val version = catalog.get().uri("/versions/$targetId").retrieve().body(JsonNode::class.java)
                    version?.path("publicationStatus")?.asText() == "published" &&
                        version.path("listing").asText() == "public"
                }
                "amendment" -> {
                    if (scopeRevisionId == null) {
                        false
                    } else {
                        val owner = amendment.get().uri("/amendments/$targetId").retrieve().body(JsonNode::class.java)
                        owner?.path("publishedRevisionId")?.asText() == scopeRevisionId.toString()
                    }
                }
                "country_wiki", "constitution_wiki" -> {
                    val kind = if (targetType == "country_wiki") "country" else "constitution"
                    val page = catalog.get().uri("/wiki/$kind/$targetId").retrieve().body(JsonNode::class.java)
                    scopeRevisionId != null && page?.path("id")?.asText() == scopeRevisionId.toString()
                }
                else -> false
            }
        }.getOrDefault(false)

    override fun requireAmendmentRevision(targetId: UUID, scopeRevisionId: UUID, authorization: String?, allowPublished: Boolean) {
        require(authorization != null) { "Authorization is required" }
        val owner = amendment.get().uri("/amendments/$targetId")
            .header("Authorization", authorization).retrieve().body(JsonNode::class.java)
            ?: throw NotFoundException("Amendment not found")
        val revisions = amendment.get().uri("/amendments/$targetId/revisions")
            .header("Authorization", authorization).retrieve().body(JsonNode::class.java)
            ?: throw NotFoundException("Amendment revisions not found")
        require(revisions.isArray && revisions.size() > 0 && revisions.last().path("id").asText() == scopeRevisionId.toString()) {
            "Only the current amendment draft can change links"
        }
        require(allowPublished || owner.path("publishedRevisionId").asText() != scopeRevisionId.toString()) {
            "Published amendment links are immutable"
        }
    }

    override fun amendmentAncestry(targetId: UUID, scopeRevisionId: UUID, authorization: String?): List<UUID> {
        val call = amendment.get().uri("/amendments/$targetId/revisions/$scopeRevisionId/ancestry")
        val response = if (authorization != null) call.header("Authorization", authorization) else call
        val ids = response.retrieve().body(Array<UUID>::class.java)
            ?: throw NotFoundException("Amendment revision not found")
        return ids.toList()
    }

    override fun publishedAmendmentRevision(targetId: UUID): UUID? = runCatching {
        val owner = amendment.get().uri("/amendments/$targetId").retrieve().body(JsonNode::class.java)
        owner?.path("publishedRevisionId")?.asText()?.takeIf { it.isNotBlank() }?.let(UUID::fromString)
    }.getOrNull()

    override fun requireWikiRevision(targetType: String, targetId: UUID, scopeRevisionId: UUID, authorization: String?) {
        require(authorization != null) { "Authorization is required" }
        val kind = if (targetType == "country_wiki") "country" else "constitution"
        val draft = catalog.get().uri("/wiki/$kind/$targetId/draft")
            .header("Authorization", authorization).retrieve().body(JsonNode::class.java)
            ?: throw NotFoundException("Wiki draft not found")
        require(draft.path("id").asText() == scopeRevisionId.toString()) { "Only the current wiki draft can change image links" }
        val published = catalog.get().uri("/wiki/$kind/$targetId").retrieve().body(JsonNode::class.java)
        require(published?.path("id")?.asText() != scopeRevisionId.toString()) { "Published wiki image links are immutable" }
    }
}

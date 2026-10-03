package com.constitutionatlas.amendment.client

import com.constitutionatlas.amendment.ContentUnavailableException
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.platform.OrderedEntry
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.ParameterizedTypeReference
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class ContentTreeNode(
    val id: UUID,
    val kind: String,
    val articleNumber: String? = null,
    val label: String? = null,
    val number: String? = null,
    val title: String? = null,
    val body: String? = null,
    val children: List<ContentTreeNode> = emptyList(),
    val predecessorId: UUID? = null,
    val content: List<OrderedEntry>? = null,
    val logicalId: UUID? = null,
    val revisionId: UUID? = null,
    val lineage: List<UUID> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ContentTreeArticle(
    val id: UUID,
    val versionId: UUID,
    val articleNumber: String,
    val title: String,
    val sortOrder: Int,
    val kind: String = "article",
    val body: String? = null,
    val children: List<ContentTreeNode> = emptyList(),
    val predecessorId: UUID? = null,
    val content: List<OrderedEntry>? = null,
    val logicalId: UUID? = null,
    val revisionId: UUID? = null,
    val legacyIdentity: Boolean = false,
    val lineage: List<UUID> = emptyList(),
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ResolvedContentUnit(
    val versionId: UUID,
    val constitutionId: UUID? = null,
    val logicalId: UUID,
    val revisionId: UUID,
    val occurrenceId: UUID,
    val rootOccurrenceId: UUID,
    val kind: String,
    val articleNumber: String? = null,
    val text: String,
    val deepLink: String,
    val pathLabels: List<String> = emptyList(),
)

fun ResolvedContentUnit.toAmendmentRef(unitKind: String = if (kind == "parent_text") "text_entry" else "node"): AmendmentUnitRefDto =
    AmendmentUnitRefDto(
        versionId = versionId,
        logicalId = logicalId,
        occurrenceId = occurrenceId,
        rootOccurrenceId = rootOccurrenceId,
        revisionId = revisionId,
        unitKind = unitKind,
        articleNumber = articleNumber,
        constitutionId = constitutionId,
        kind = kind,
        breadcrumbs = pathLabels,
        text = text,
        deepLink = deepLink,
    )

interface ContentClient {
    fun listArticles(versionId: UUID): List<ContentTreeArticle>

    fun settingsRevisionId(versionId: UUID): UUID? = null

    fun resolve(versionId: UUID, logicalId: UUID): ResolvedContentUnit? = null
}

class RestContentClient(
    contentUrl: String,
) : ContentClient {
    private val client: RestClient = timedRestClient(contentUrl)

    override fun listArticles(versionId: UUID): List<ContentTreeArticle> {
        val collected = mutableListOf<ContentTreeArticle>()
        var offset = 0
        try {
            while (true) {
                val entity =
                    client.get()
                        .uri(
                            "/versions/{id}/units?includeBody=true&offset={offset}&limit={limit}",
                            versionId,
                            offset,
                            PAGE_SIZE,
                        )
                        .retrieve()
                        .toEntity(ARTICLE_LIST)
                val page = entity.body.orEmpty()
                collected.addAll(page)
                val total = entity.headers.getFirst("X-Total-Count")?.toIntOrNull() ?: collected.size
                if (collected.size >= total || page.isEmpty()) {
                    break
                }
                offset += PAGE_SIZE
            }
        } catch (ex: RestClientException) {
            throw ContentUnavailableException("content list failed", ex)
        }
        return collected
    }

    override fun settingsRevisionId(versionId: UUID): UUID? = try {
        client.get().uri("/versions/{id}/content", versionId).retrieve().body(ContentSettingsPin::class.java)?.settingsRevisionId
    } catch (ex: RestClientException) {
        throw ContentUnavailableException("content settings lookup failed", ex)
    }

    override fun resolve(versionId: UUID, logicalId: UUID): ResolvedContentUnit? =
        try {
            client.get()
                .uri("/versions/{versionId}/resolve?logicalId={logicalId}", versionId, logicalId)
                .retrieve()
                .body(ResolvedContentUnit::class.java)
        } catch (ex: org.springframework.web.client.HttpClientErrorException.NotFound) {
            null
        } catch (ex: RestClientException) {
            throw ContentUnavailableException("content unit resolution failed", ex)
        }

    companion object {
        private const val PAGE_SIZE = 200
        private val ARTICLE_LIST = object : ParameterizedTypeReference<List<ContentTreeArticle>>() {}
    }
}

@JsonIgnoreProperties(ignoreUnknown = true)
data class ContentSettingsPin(val settingsRevisionId: UUID? = null)

@Configuration
class ContentClientConfig {
    @Bean
    @ConditionalOnMissingBean(ContentClient::class)
    fun contentClient(@Value("\${content.api.url}") contentUrl: String): ContentClient =
        RestContentClient(contentUrl)
}

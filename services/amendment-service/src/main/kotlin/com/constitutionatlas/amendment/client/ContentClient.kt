package com.constitutionatlas.amendment.client

import com.constitutionatlas.amendment.ContentUnavailableException
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
    val label: String? = null,
    val number: String? = null,
    val title: String? = null,
    val body: String? = null,
    val children: List<ContentTreeNode> = emptyList(),
    val predecessorId: UUID? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ContentTreeArticle(
    val id: UUID,
    val versionId: UUID,
    val articleNumber: String,
    val title: String,
    val sortOrder: Int,
    val body: String? = null,
    val children: List<ContentTreeNode> = emptyList(),
    val predecessorId: UUID? = null,
)

interface ContentClient {
    fun listArticles(versionId: UUID): List<ContentTreeArticle>
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
                            "/versions/{id}/articles?includeBody=true&offset={offset}&limit={limit}",
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

    companion object {
        private const val PAGE_SIZE = 200
        private val ARTICLE_LIST = object : ParameterizedTypeReference<List<ContentTreeArticle>>() {}
    }
}

@Configuration
class ContentClientConfig {
    @Bean
    @ConditionalOnMissingBean(ContentClient::class)
    fun contentClient(@Value("\${content.api.url}") contentUrl: String): ContentClient =
        RestContentClient(contentUrl)
}

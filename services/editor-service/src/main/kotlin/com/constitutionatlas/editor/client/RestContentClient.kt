package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.NotFoundException
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.ParameterizedTypeReference
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

class RestContentClient(
    contentUrl: String,
    private val bearerToken: String? = null,
) : ContentClient {
    private val client: RestClient = timedRestClient(contentUrl)

    override fun listArticles(versionId: UUID): List<ContentTreeArticle> =
        try {
            client.get()
                .uri("/versions/{id}/articles?includeBody=true", versionId)
                .retrieve()
                .body(ARTICLE_LIST)
                ?: emptyList()
        } catch (ex: RestClientException) {
            throw DownstreamException("content list failed", ex)
        }

    override fun replaceArticles(versionId: UUID, articles: List<ArticleWritePayload>) {
        try {
            val request = client.put()
                .uri("/versions/{id}/articles", versionId)
                .contentType(MediaType.APPLICATION_JSON)
            authorize(request)
            request.body(articles).retrieve().toBodilessEntity()
        } catch (ex: RestClientException) {
            throw DownstreamException("content replace failed", ex)
        }
    }

    override fun updateArticle(articleId: UUID, title: String, body: String) {
        try {
            val request = client.patch()
                .uri("/articles/{id}", articleId)
                .contentType(MediaType.APPLICATION_JSON)
            authorize(request)
            request
                .body(mapOf("title" to title, "body" to body))
                .retrieve()
                .toBodilessEntity()
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) {
                throw NotFoundException("Unknown article '$articleId'")
            }
            throw DownstreamException("content update failed", ex)
        } catch (ex: RestClientException) {
            throw DownstreamException("content update failed", ex)
        }
    }

    private fun authorize(spec: RestClient.RequestHeadersSpec<*>) {
        if (!bearerToken.isNullOrBlank()) {
            spec.header("Authorization", bearerHeader(bearerToken))
        }
    }

    companion object {
        private val ARTICLE_LIST = object : ParameterizedTypeReference<List<ContentTreeArticle>>() {}
    }
}

internal fun bearerHeader(token: String): String =
    if (token.startsWith("Bearer ")) token else "Bearer $token"

@Configuration
class ContentClientConfig {
    @Bean
    @ConditionalOnMissingBean(ContentClient::class)
    fun contentClient(
        @Value("\${content.api.url}") contentUrl: String,
        @Value("\${editor.downstream.bearer:}") bearer: String,
    ): ContentClient = RestContentClient(contentUrl, bearer.trim().ifBlank { null })
}

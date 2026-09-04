package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.NotFoundException
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

class RestContentClient(
    contentUrl: String,
) : ContentClient {
    private val client: RestClient = RestClient.builder().baseUrl(contentUrl).build()

    override fun getArticle(articleId: UUID): ContentArticle {
        val body = try {
            client.get()
                .uri("/articles/{id}", articleId)
                .retrieve()
                .body(ContentArticleWire::class.java)
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) {
                throw NotFoundException("Unknown article '$articleId'")
            }
            throw ex
        } ?: throw NotFoundException("Unknown article '$articleId'")
        return ContentArticle(body.id, body.versionId, body.title, body.body)
    }

    override fun updateArticle(articleId: UUID, title: String, body: String) {
        try {
            client.patch()
                .uri("/articles/{id}", articleId)
                .contentType(MediaType.APPLICATION_JSON)
                .body(mapOf("title" to title, "body" to body))
                .retrieve()
                .toBodilessEntity()
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) {
                throw NotFoundException("Unknown article '$articleId'")
            }
            throw ex
        }
    }

    private data class ContentArticleWire(
        val id: UUID,
        val versionId: UUID,
        val title: String,
        val body: String,
    )
}

@Configuration
class ContentClientConfig {
    @Bean
    @ConditionalOnMissingBean(ContentClient::class)
    fun contentClient(@Value("\${content.api.url}") contentUrl: String): ContentClient =
        RestContentClient(contentUrl)
}

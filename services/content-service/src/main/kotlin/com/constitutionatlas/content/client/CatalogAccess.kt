package com.constitutionatlas.content.client

import com.constitutionatlas.content.CatalogUnavailableException
import com.constitutionatlas.content.VersionPublishedException
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class CatalogVersion(
    val id: UUID,
    val publicationStatus: String,
)

interface CatalogClient {
    fun getVersion(versionId: UUID): CatalogVersion?
}

class RestCatalogClient(
    catalogUrl: String,
) : CatalogClient {
    private val client: RestClient = RestClient.builder().baseUrl(catalogUrl).build()

    override fun getVersion(versionId: UUID): CatalogVersion? =
        try {
            client.get()
                .uri("/versions/{id}", versionId)
                .retrieve()
                .body(CatalogVersion::class.java)
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) {
                null
            } else {
                throw CatalogUnavailableException("catalog version lookup failed", ex)
            }
        } catch (ex: RestClientException) {
            throw CatalogUnavailableException("catalog version lookup failed", ex)
        }
}

@Component
class PublicationGuard(private val catalogClient: CatalogClient) {
    fun requireWritable(versionId: UUID) {
        val version = catalogClient.getVersion(versionId) ?: return
        if (version.publicationStatus.equals("published", ignoreCase = true)) {
            throw VersionPublishedException()
        }
    }
}

@Configuration
class CatalogClientConfig {
    @Bean
    @ConditionalOnMissingBean(CatalogClient::class)
    fun catalogClient(@Value("\${catalog.api.url}") catalogUrl: String): CatalogClient =
        RestCatalogClient(catalogUrl)
}

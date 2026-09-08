package com.constitutionatlas.amendment.client

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class CatalogVersion(
    val id: UUID,
    val constitutionId: UUID,
)

interface CatalogClient {
    fun getVersion(versionId: UUID): CatalogVersion?
}

class RestCatalogClient(
    catalogUrl: String,
) : CatalogClient {
    private val client: RestClient = timedRestClient(catalogUrl)

    override fun getVersion(versionId: UUID): CatalogVersion? =
        try {
            client.get()
                .uri("/versions/{id}", versionId)
                .retrieve()
                .body(CatalogVersion::class.java)
        } catch (_: RestClientException) {
            null
        }
}

@Configuration
class CatalogClientConfig {
    @Bean
    @ConditionalOnMissingBean(CatalogClient::class)
    fun catalogClient(@Value("\${catalog.api.url}") catalogUrl: String): CatalogClient =
        RestCatalogClient(catalogUrl)
}

package com.constitutionatlas.amendment.client

import com.constitutionatlas.amendment.CatalogUnavailableException
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

// Callers: AmendmentService.refreshReviewStatus. Unique: amendment-service client (editor has its own).
// API: GET /versions/{id} (legalVersionId, currentVersionId). User instruction: "Work on Sprint 36"

@JsonIgnoreProperties(ignoreUnknown = true)
data class CatalogVersionRef(
    val id: UUID,
    val constitutionId: UUID? = null,
    val legalVersionId: UUID? = null,
    val currentVersionId: UUID? = null,
)

interface CatalogClient {
    fun getVersion(versionId: UUID): CatalogVersionRef?
}

class RestCatalogClient(
    catalogUrl: String,
) : CatalogClient {
    private val client: RestClient = timedRestClient(catalogUrl)

    override fun getVersion(versionId: UUID): CatalogVersionRef? = try {
        client.get()
            .uri("/versions/{id}", versionId)
            .retrieve()
            .body(CatalogVersionRef::class.java)
    } catch (ex: RestClientResponseException) {
        if (ex.statusCode.value() == HttpStatus.NOT_FOUND.value()) {
            null
        } else {
            throw CatalogUnavailableException("catalog version lookup failed", ex)
        }
    } catch (ex: RestClientException) {
        throw CatalogUnavailableException("catalog version lookup failed", ex)
    }
}

@Configuration
class CatalogClientConfig {
    @Bean
    @ConditionalOnMissingBean(CatalogClient::class)
    fun catalogClient(@Value("\${catalog.api.url}") catalogUrl: String): CatalogClient =
        RestCatalogClient(catalogUrl)
}

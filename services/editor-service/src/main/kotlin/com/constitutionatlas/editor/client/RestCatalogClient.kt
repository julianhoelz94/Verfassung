package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.platform.NotFoundException
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.databind.ObjectMapper
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
import java.time.LocalDate
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class CatalogVersion(
    val id: UUID,
    val constitutionId: UUID,
    val versionLabel: String,
    val publicationStatus: String,
    val effectiveDate: LocalDate? = null,
    val languageCode: String = "en",
    val predecessorVersionId: UUID? = null,
    val hopKind: String = "initial",
    val listing: String = "public",
)

interface CatalogClient {
    fun getVersion(versionId: UUID): CatalogVersion

    fun createDraftVersion(
        constitutionId: UUID,
        versionLabel: String,
        effectiveDate: LocalDate?,
        languageCode: String,
        predecessorVersionId: UUID,
        hopKind: String,
    ): CatalogVersion

    fun listVersions(constitutionId: UUID, listing: String = "all"): List<CatalogVersion>

    fun publishVersion(versionId: UUID): CatalogVersion
}

class RestCatalogClient(
    catalogUrl: String,
    private val bearerToken: String? = null,
) : CatalogClient {
    private val client: RestClient = timedRestClient(catalogUrl)

    override fun getVersion(versionId: UUID): CatalogVersion {
        val body = try {
            client.get()
                .uri("/versions/{id}", versionId)
                .retrieve()
                .body(CatalogVersion::class.java)
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) {
                throw NotFoundException("Unknown version '$versionId'")
            }
            throw DownstreamException("catalog version lookup failed", ex)
        } catch (ex: RestClientException) {
            throw DownstreamException("catalog version lookup failed", ex)
        } ?: throw NotFoundException("Unknown version '$versionId'")
        return body
    }

    override fun createDraftVersion(
        constitutionId: UUID,
        versionLabel: String,
        effectiveDate: LocalDate?,
        languageCode: String,
        predecessorVersionId: UUID,
        hopKind: String,
    ): CatalogVersion {
        try {
            val request = client.post()
                .uri("/constitutions/{id}/versions", constitutionId)
                .contentType(MediaType.APPLICATION_JSON)
            authorize(request)
            return request
                .body(
                    mapOf(
                        "versionLabel" to versionLabel,
                        "effectiveDate" to effectiveDate,
                        "languageCode" to languageCode,
                        "predecessorVersionId" to predecessorVersionId,
                        "hopKind" to hopKind,
                    ),
                )
                .retrieve()
                .body(CatalogVersion::class.java)
                ?: throw DownstreamException("catalog create version returned no body")
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.CONFLICT) {
                val code = parseConflictCode(ex.responseBodyAsString)
                if (code == "not_tip") {
                    throw ConflictException("Predecessor is not the chain tip", "not_tip")
                }
                throw ConflictException("Version '$versionLabel' already exists")
            }
            throw DownstreamException("catalog create version failed", ex)
        } catch (ex: RestClientException) {
            throw DownstreamException("catalog create version failed", ex)
        }
    }

    override fun listVersions(constitutionId: UUID, listing: String): List<CatalogVersion> =
        try {
            val request = client.get()
                .uri("/constitutions/{id}/versions?listing={listing}", constitutionId, listing)
            authorize(request)
            request
                .retrieve()
                .body(VERSION_LIST)
                ?: emptyList()
        } catch (ex: RestClientException) {
            throw DownstreamException("catalog list versions failed", ex)
        }

    override fun publishVersion(versionId: UUID): CatalogVersion {
        try {
            val request = client.post().uri("/versions/{id}/publish", versionId)
            authorize(request)
            return request
                .retrieve()
                .body(CatalogVersion::class.java)
                ?: throw DownstreamException("catalog publish returned no body")
        } catch (ex: RestClientException) {
            throw DownstreamException("catalog publish failed", ex)
        }
    }

    private fun authorize(spec: RestClient.RequestHeadersSpec<*>) {
        if (!bearerToken.isNullOrBlank()) {
            spec.header("Authorization", bearerHeader(bearerToken))
        }
    }

    companion object {
        private val VERSION_LIST = object : ParameterizedTypeReference<List<CatalogVersion>>() {}
        private val objectMapper = ObjectMapper()

        private fun parseConflictCode(body: String): String? =
            try {
                @Suppress("UNCHECKED_CAST")
                objectMapper.readValue(body, Map::class.java)["code"] as? String
            } catch (_: Exception) {
                null
            }
    }
}

@Configuration
class CatalogClientConfig {
    @Bean
    @ConditionalOnMissingBean(CatalogClient::class)
    fun catalogClient(
        @Value("\${catalog.api.url}") catalogUrl: String,
        @Value("\${editor.downstream.bearer:}") bearer: String,
    ): CatalogClient = RestCatalogClient(catalogUrl, bearer.trim().ifBlank { null })
}

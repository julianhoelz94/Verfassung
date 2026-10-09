package com.constitutionatlas.content.client

import com.constitutionatlas.content.CatalogUnavailableException
import com.constitutionatlas.content.VersionPublishedException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
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
    val constitutionId: UUID? = null,
    val listing: String = "public",
)

data class StructuralLevel(
    val kindCode: String,
    val mayHoldText: Boolean,
    val mayHoldChildren: Boolean,
    val allowedChildKinds: List<String>,
    val titlePolicy: String = "optional",
    val labelPolicy: String = "optional",
)

data class StructuralOutline(val kinds: List<StructuralLevel>)

data class StructuralSettings(val id: UUID, val outline: StructuralOutline)

interface CatalogClient {
    fun getVersion(versionId: UUID): CatalogVersion?

    fun getSettings(versionId: UUID): StructuralSettings? = null
}

class RestCatalogClient(
    catalogUrl: String,
) : CatalogClient {
    private val client: RestClient = timedRestClient(catalogUrl)

    override fun getSettings(versionId: UUID): StructuralSettings? =
        try {
            client.get().uri("/versions/{id}/settings", versionId).retrieve().body(StructuralSettings::class.java)
        } catch (ex: RestClientException) {
            throw CatalogUnavailableException("catalog settings lookup failed", ex)
        }

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

@Component
class ContentReadAccess(private val catalogClient: CatalogClient, private val identityClient: IdentityClient) {
    fun requireVisible(versionId: UUID, authorization: String?) {
        val version = catalogClient.getVersion(versionId) ?: throw NotFoundException("Unknown version")
        if (version.publicationStatus == "published" && version.listing == "public") return
        val actor = runCatching { identityClient.authenticate(authorization) }.getOrNull()
        if (actor == null || actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") } &&
            actor.scopes.none { it in setOf("catalog:write", "content:write", "ingestion:publish") }) {
            throw NotFoundException("Unknown version")
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

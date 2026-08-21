package com.constitutionatlas.ingestion.client

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.constitutionatlas.ingestion.api.ImportArticle
import org.springframework.http.HttpStatus
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.time.LocalDate
import java.util.UUID

class RestCatalogClient(
    catalogUrl: String,
) : CatalogClient {
    private val client: RestClient = RestClient.builder().baseUrl(catalogUrl).build()

    override fun getCountry(isoCode: String): DownstreamCountry? =
        try {
            client.get().uri("/countries/{iso}", isoCode).retrieve().body(DownstreamCountry::class.java)
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) null else throw ex
        }

    override fun createCountry(isoCode: String, name: String): DownstreamCountry =
        client.post()
            .uri("/countries")
            .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .body(mapOf("isoCode" to isoCode, "name" to name))
            .retrieve()
            .body(DownstreamCountry::class.java)!!

    override fun findConstitution(isoCode: String, slug: String): DownstreamConstitution? {
        val detail = try {
            client.get().uri("/countries/{iso}", isoCode).retrieve().body(CountryDetailWire::class.java)
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) return null else throw ex
        } ?: return null
        return detail.constitutions.firstOrNull { it.slug == slug }
    }

    override fun createConstitution(isoCode: String, slug: String, title: String): DownstreamConstitution =
        client.post()
            .uri("/countries/{iso}/constitutions", isoCode)
            .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .body(mapOf("slug" to slug, "title" to title))
            .retrieve()
            .body(DownstreamConstitution::class.java)!!

    override fun createDraftVersion(
        constitutionId: UUID,
        versionLabel: String,
        effectiveDate: LocalDate?,
        languageCode: String,
        sourceUrl: String?,
        gazetteReference: String?,
    ): DownstreamVersion {
        val body = mapOf(
            "versionLabel" to versionLabel,
            "effectiveDate" to effectiveDate,
            "languageCode" to languageCode,
            "sourceUrl" to sourceUrl,
            "gazetteReference" to gazetteReference,
        )
        return client.post()
            .uri("/constitutions/{id}/versions", constitutionId)
            .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .body(body)
            .retrieve()
            .body(DownstreamVersion::class.java)!!
    }

    override fun publishVersion(versionId: UUID): DownstreamVersion =
        client.post()
            .uri("/versions/{id}/publish", versionId)
            .retrieve()
            .body(DownstreamVersion::class.java)!!

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class CountryDetailWire(
        val constitutions: List<DownstreamConstitution> = emptyList(),
    )
}

class RestContentClient(
    contentUrl: String,
) : ContentClient {
    private val client: RestClient = RestClient.builder().baseUrl(contentUrl).build()

    override fun replaceArticles(versionId: UUID, articles: List<ImportArticle>) {
        client.put()
            .uri("/versions/{id}/articles", versionId)
            .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .body(articles)
            .retrieve()
            .toBodilessEntity()
    }
}

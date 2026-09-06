package com.constitutionatlas.ingestion.client

import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.time.LocalDate
import java.util.UUID

private fun <T> RestClient.postJson(path: String, body: Any, type: Class<T>, vararg uriVars: Any): T =
    post()
        .uri(path, *uriVars)
        .contentType(MediaType.APPLICATION_JSON)
        .body(body)
        .retrieve()
        .body(type)!!

private fun RestClient.putJson(path: String, body: Any, vararg uriVars: Any) {
    put()
        .uri(path, *uriVars)
        .contentType(MediaType.APPLICATION_JSON)
        .body(body)
        .retrieve()
        .toBodilessEntity()
}

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
        client.postJson("/countries", mapOf("isoCode" to isoCode, "name" to name), DownstreamCountry::class.java)

    override fun findConstitution(isoCode: String, slug: String): DownstreamConstitution? {
        val detail = try {
            client.get().uri("/countries/{iso}", isoCode).retrieve().body(CountryDetailWire::class.java)
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) return null else throw ex
        } ?: return null
        return detail.constitutions.firstOrNull { it.slug == slug }
    }

    override fun createConstitution(isoCode: String, slug: String, title: String): DownstreamConstitution =
        client.postJson(
            "/countries/{iso}/constitutions",
            mapOf("slug" to slug, "title" to title),
            DownstreamConstitution::class.java,
            isoCode,
        )

    override fun createDraftVersion(
        constitutionId: UUID,
        versionLabel: String,
        effectiveDate: LocalDate?,
        languageCode: String,
        sourceUrl: String?,
        gazetteReference: String?,
    ): DownstreamVersion =
        client.postJson(
            "/constitutions/{id}/versions",
            mapOf(
                "versionLabel" to versionLabel,
                "effectiveDate" to effectiveDate,
                "languageCode" to languageCode,
                "sourceUrl" to sourceUrl,
                "gazetteReference" to gazetteReference,
            ),
            DownstreamVersion::class.java,
            constitutionId,
        )

    override fun publishVersion(versionId: UUID): DownstreamVersion =
        client.post()
            .uri("/versions/{id}/publish", versionId)
            .retrieve()
            .body(DownstreamVersion::class.java)!!

    override fun replaceOutline(constitutionId: UUID, kinds: List<ImportOutlineKind>) {
        client.putJson("/constitutions/{id}/content-outline", mapOf("kinds" to kinds), constitutionId)
    }

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
        client.putJson("/versions/{id}/articles", articles, versionId)
    }
}

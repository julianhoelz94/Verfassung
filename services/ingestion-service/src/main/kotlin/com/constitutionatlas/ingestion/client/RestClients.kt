package com.constitutionatlas.ingestion.client

import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.OrderedSnapshotWrite
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.time.LocalDate
import java.util.UUID

private fun restClient(baseUrl: String): RestClient =
    timedRestClientBuilder(baseUrl)
        .requestInterceptor { request, body, execution ->
            DownstreamAuth.header()?.let { request.headers.set(HttpHeaders.AUTHORIZATION, it) }
            execution.execute(request, body)
        }
        .build()

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
    private val client: RestClient = restClient(catalogUrl)

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

    override fun currentSettingsRevisionId(constitutionId: UUID): UUID =
        client.get().uri("/constitutions/{id}/settings", constitutionId)
            .retrieve().body(SettingsRevisionWire::class.java)!!.id

    override fun version(versionId: UUID): DownstreamVersion? = try {
        client.get().uri("/versions/{id}", versionId).retrieve().body(DownstreamVersion::class.java)
    } catch (ex: RestClientResponseException) {
        if (ex.statusCode == HttpStatus.NOT_FOUND) null else throw ex
    }

    override fun settingsOutline(constitutionId: UUID, revisionId: UUID): ImportOutline =
        client.get().uri("/constitutions/{id}/settings/{revisionId}", constitutionId, revisionId)
            .retrieve().body(SettingsRevisionWire::class.java)!!.outline

    override fun createConstitution(isoCode: String, slug: String, title: String, predecessorConstitutionId: UUID?, interim: Boolean): DownstreamConstitution =
        client.postJson(
            "/countries/{iso}/constitutions",
            mapOf("slug" to slug, "title" to title, "predecessorConstitutionId" to predecessorConstitutionId, "interim" to interim),
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
        predecessorVersionId: UUID?,
        hopKind: String?,
        importJobId: UUID?,
        settingsRevisionId: UUID?,
    ): DownstreamVersion =
        client.postJson(
            "/constitutions/{id}/versions",
            mapOf(
                "versionLabel" to versionLabel,
                "effectiveDate" to effectiveDate,
                "languageCode" to languageCode,
                "sourceUrl" to sourceUrl,
                "gazetteReference" to gazetteReference,
                "predecessorVersionId" to predecessorVersionId,
                "hopKind" to hopKind,
                "importJobId" to importJobId,
                "structuralSettingsRevisionId" to settingsRevisionId,
            ),
            DownstreamVersion::class.java,
            constitutionId,
        )

    override fun publishVersion(versionId: UUID, importJobId: UUID?): DownstreamVersion =
        client.post()
            .uri("/versions/{id}/publish?importJobId={jobId}", versionId, importJobId)
            .retrieve()
            .body(DownstreamVersion::class.java)!!

    override fun replaceOutline(constitutionId: UUID, kinds: List<ImportOutlineKind>) {
        client.putJson("/constitutions/{id}/content-outline", mapOf("kinds" to kinds), constitutionId)
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class CountryDetailWire(
        val constitutions: List<DownstreamConstitution> = emptyList(),
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class SettingsRevisionWire(val id: UUID, val outline: ImportOutline = ImportOutline())
}

class RestContentClient(
    contentUrl: String,
) : ContentClient {
    private val client: RestClient = restClient(contentUrl)

    override fun replaceRoots(versionId: UUID, roots: List<OrderedNodeWrite>) {
        client.putJson("/versions/{id}/content", OrderedSnapshotWrite(expectedGeneration = 0, roots = roots), versionId)
    }

    override fun replaceArticles(versionId: UUID, articles: List<ImportArticle>) {
        client.putJson("/versions/{id}/articles", articles, versionId)
    }

    override fun snapshot(versionId: UUID): OrderedSnapshot =
        client.get().uri("/versions/{id}/content", versionId).retrieve().body(OrderedSnapshot::class.java)!!
}

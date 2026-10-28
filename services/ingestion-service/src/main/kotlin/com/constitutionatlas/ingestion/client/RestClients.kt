package com.constitutionatlas.ingestion.client

import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.OrderedSnapshotWrite
import com.constitutionatlas.platform.timedRestClientBuilder
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

private fun <T : Any> RestClient.postJson(path: String, body: Any, type: Class<T>, vararg uriVars: Any): T =
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

    override fun createSetupConstitution(operationId: UUID, request: com.constitutionatlas.ingestion.api.SetupProposalRequest): DownstreamSetupConstitution {
        val body = mapOf(
            "creationAttemptId" to operationId,
            "slug" to request.constitutionSlug.trim(),
            "title" to request.constitutionTitle.trim(),
            "predecessorConstitutionId" to request.predecessorConstitutionId,
            "interim" to request.interim,
            "outline" to request.outline.kinds,
        )
        return try {
            if (request.jurisdictionId != null) {
                client.postJson("/jurisdictions/{id}/constitutions", body, DownstreamSetupConstitution::class.java, request.jurisdictionId)
            } else {
                client.postJson("/countries/{iso}/constitutions", body, DownstreamSetupConstitution::class.java, request.isoCode.trim().uppercase())
            }
        } catch (ex: RestClientResponseException) {
            val code = runCatching { ex.getResponseBodyAs(Map::class.java)?.get("code") }.getOrNull()
            if (ex.statusCode == HttpStatus.CONFLICT && code == "constitution_creation_rejected") throw SetupCreationRejectedException()
            throw ex
        }
    }

    override fun getJurisdiction(id: UUID): DownstreamJurisdiction =
        client.get().uri("/jurisdictions/{id}", id).retrieve().body(JurisdictionWire::class.java)!!.jurisdiction

    override fun findJurisdictionConstitution(id: UUID, slug: String): DownstreamConstitution? =
        client.get().uri("/jurisdictions/{id}", id).retrieve().body(JurisdictionWire::class.java)!!.constitutions.firstOrNull { it.slug == slug }

    override fun createJurisdictionConstitution(id: UUID, slug: String, title: String, predecessorConstitutionId: UUID?, interim: Boolean): DownstreamConstitution =
        client.postJson("/jurisdictions/{id}/constitutions", mapOf("slug" to slug, "title" to title, "predecessorConstitutionId" to predecessorConstitutionId, "interim" to interim), DownstreamConstitution::class.java, id)

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class JurisdictionWire(val jurisdiction: DownstreamJurisdiction, val constitutions: List<DownstreamConstitution> = emptyList())

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
            .retrieve().body(SettingsRevisionWire::class.java)!!.outline.importOutline()

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
        sourceEvidence: com.constitutionatlas.platform.SourceEvidence?,
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
                "publishAttemptId" to importJobId,
                "structuralSettingsRevisionId" to settingsRevisionId,
                "sourceEvidence" to sourceEvidence,
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
    private data class SettingsRevisionWire(val id: UUID, val outline: ReadOutline = ReadOutline())

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class ReadOutline(val kinds: List<ReadKind> = emptyList()) {
        fun importOutline() = ImportOutline(kinds.map { it.importKind() })
    }

    /** Catalog adds derived read metadata; input DTOs deliberately reject unknown write fields. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class ReadKind(
        val kindCode: String,
        val displayLabel: String,
        val presentation: String = "section",
        val showLabel: Boolean = true,
        val showTitle: Boolean = false,
        val showKind: Boolean = false,
        val allowTextAlongsideChildren: Boolean = false,
        val titlePolicy: String = "optional",
        val labelPolicy: String = "optional",
        val labelPlacement: String = "before_title",
        val segmentation: String = "plain",
        val root: Boolean? = null,
        val allowedChildKinds: List<String>? = null,
    ) {
        fun importKind() = ImportOutlineKind(kindCode, displayLabel, presentation, showLabel, showTitle, showKind, allowTextAlongsideChildren, titlePolicy, labelPolicy, labelPlacement, segmentation, root, allowedChildKinds)
    }
}

class RestContentClient(
    contentUrl: String,
) : ContentClient {
    private val client: RestClient = restClient(contentUrl)

    override fun sealImport(versionId: UUID, attemptId: UUID, generation: Long, settingsRevisionId: UUID) {
        client.postJson("/versions/{id}/seal-import", mapOf("attemptId" to attemptId, "expectedGeneration" to generation, "settingsRevisionId" to settingsRevisionId), OrderedSnapshot::class.java, versionId)
    }

    override fun replaceRoots(versionId: UUID, roots: List<OrderedNodeWrite>, sourceVersionId: UUID?) {
        val persisted = snapshot(versionId)
        if (persisted.generation > 0) {
            check(com.constitutionatlas.platform.OrderedContentFidelity.matches(roots, persisted.roots)) { "Reserved draft already contains different persisted content; reconcile before retrying" }
            return
        }
        val source = sourceVersionId?.let(::snapshot)
        client.putJson("/versions/{id}/content", OrderedSnapshotWrite(expectedGeneration = 0, sourceVersionId = sourceVersionId, sourceGeneration = source?.generation, roots = roots), versionId)
    }

    override fun replaceArticles(versionId: UUID, articles: List<ImportArticle>) {
        val persisted = snapshot(versionId)
        if (persisted.generation > 0) {
            check(com.constitutionatlas.platform.OrderedContentFidelity.matches(com.constitutionatlas.ingestion.service.legacyImportRoots(articles), persisted.roots)) { "Reserved legacy draft already contains different persisted content; reconcile before retrying" }
            return
        }
        client.putJson("/versions/{id}/articles", articles, versionId)
    }

    override fun snapshot(versionId: UUID): OrderedSnapshot =
        client.get().uri("/versions/{id}/content", versionId).retrieve().body(OrderedSnapshot::class.java)!!
}

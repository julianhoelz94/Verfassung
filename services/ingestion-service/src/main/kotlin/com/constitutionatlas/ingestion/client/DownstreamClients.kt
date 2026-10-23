package com.constitutionatlas.ingestion.client

import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedSnapshot
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import java.time.LocalDate
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class DownstreamCountry(val id: UUID, val isoCode: String, val name: String)

@JsonIgnoreProperties(ignoreUnknown = true)
data class DownstreamConstitution(val id: UUID, val slug: String, val title: String)

@JsonIgnoreProperties(ignoreUnknown = true)
data class DownstreamVersion(
    val id: UUID,
    val constitutionId: UUID = UUID(0, 0),
    val publicationStatus: String = "draft",
    val versionLabel: String? = null,
    val sourceUrl: String? = null,
    val gazetteReference: String? = null,
    val effectiveDate: LocalDate? = null,
    val jurisdictionId: UUID? = null,
    val sourceEvidence: com.constitutionatlas.platform.SourceEvidence? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class DownstreamJurisdiction(val id: UUID, val name: String, val code: String? = null)

interface CatalogClient {
    fun getJurisdiction(id: UUID): DownstreamJurisdiction = throw UnsupportedOperationException("Jurisdiction lookup unavailable")
    fun findJurisdictionConstitution(id: UUID, slug: String): DownstreamConstitution? = throw UnsupportedOperationException("Jurisdiction lookup unavailable")
    fun createJurisdictionConstitution(id: UUID, slug: String, title: String, predecessorConstitutionId: UUID? = null, interim: Boolean = false): DownstreamConstitution = throw UnsupportedOperationException("Jurisdiction creation unavailable")
    fun getCountry(isoCode: String): DownstreamCountry?
    fun createCountry(isoCode: String, name: String): DownstreamCountry
    fun findConstitution(isoCode: String, slug: String): DownstreamConstitution?
    fun currentSettingsRevisionId(constitutionId: UUID): UUID
    fun version(versionId: UUID): DownstreamVersion? = null
    fun settingsOutline(constitutionId: UUID, revisionId: UUID): ImportOutline = ImportOutline()
    fun createConstitution(isoCode: String, slug: String, title: String, predecessorConstitutionId: UUID? = null, interim: Boolean = false): DownstreamConstitution
    fun createDraftVersion(
        constitutionId: UUID,
        versionLabel: String,
        effectiveDate: LocalDate?,
        languageCode: String,
        sourceUrl: String?,
        gazetteReference: String?,
        predecessorVersionId: UUID? = null,
        hopKind: String? = null,
        importJobId: UUID? = null,
        settingsRevisionId: UUID? = null,
        sourceEvidence: com.constitutionatlas.platform.SourceEvidence? = null,
    ): DownstreamVersion
    fun publishVersion(versionId: UUID, importJobId: UUID? = null): DownstreamVersion
    fun replaceOutline(constitutionId: UUID, kinds: List<ImportOutlineKind>)
}

interface ContentClient {
    fun replaceArticles(versionId: UUID, articles: List<ImportArticle>)
    fun replaceRoots(versionId: UUID, roots: List<OrderedNodeWrite>, sourceVersionId: UUID? = null): Unit = throw UnsupportedOperationException("Ordered import is unavailable")
    fun snapshot(versionId: UUID): OrderedSnapshot
}

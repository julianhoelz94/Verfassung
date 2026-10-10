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
data class DownstreamVersion(val id: UUID, val constitutionId: UUID = UUID(0, 0), val publicationStatus: String = "draft")

interface CatalogClient {
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
    ): DownstreamVersion
    fun publishVersion(versionId: UUID, importJobId: UUID? = null): DownstreamVersion
    fun replaceOutline(constitutionId: UUID, kinds: List<ImportOutlineKind>)
}

interface ContentClient {
    fun replaceArticles(versionId: UUID, articles: List<ImportArticle>)
    fun replaceRoots(versionId: UUID, roots: List<OrderedNodeWrite>): Unit = throw UnsupportedOperationException("Ordered import is unavailable")
    fun snapshot(versionId: UUID): OrderedSnapshot
}

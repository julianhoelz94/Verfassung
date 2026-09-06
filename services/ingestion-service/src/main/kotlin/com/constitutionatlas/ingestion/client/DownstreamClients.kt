package com.constitutionatlas.ingestion.client

import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportOutlineKind
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
    fun createConstitution(isoCode: String, slug: String, title: String): DownstreamConstitution
    fun createDraftVersion(
        constitutionId: UUID,
        versionLabel: String,
        effectiveDate: LocalDate?,
        languageCode: String,
        sourceUrl: String?,
        gazetteReference: String?,
    ): DownstreamVersion
    fun publishVersion(versionId: UUID): DownstreamVersion
    fun replaceOutline(constitutionId: UUID, kinds: List<ImportOutlineKind>)
}

interface ContentClient {
    fun replaceArticles(versionId: UUID, articles: List<ImportArticle>)
}

package com.constitutionatlas.search.client

import com.constitutionatlas.search.timedRestClient
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.ParameterizedTypeReference
import org.springframework.web.client.RestClient
import java.time.LocalDate
import java.util.UUID

class RestIndexSource(
    catalogUrl: String,
    contentUrl: String,
) : IndexSource {
    private val catalog: RestClient = timedRestClient(catalogUrl)
    private val content: RestClient = timedRestClient(contentUrl)

    override fun loadPublishedArticles(): List<IndexableArticle> {
        val countries = catalog.get()
            .uri("/countries")
            .retrieve()
            .body(object : ParameterizedTypeReference<List<CountrySummaryWire>>() {})
            .orEmpty()
        val out = mutableListOf<IndexableArticle>()
        for (country in countries) {
            val detail = catalog.get()
                .uri("/countries/{code}", country.isoCode)
                .retrieve()
                .body(CountryDetailWire::class.java)
                ?: continue
            val countryName = detail.name.ifBlank { country.name }.ifBlank { country.isoCode }
            for (constitution in detail.constitutions) {
                for (version in constitution.versions) {
                    out += loadArticles(country.isoCode, countryName, constitution.title, version)
                }
            }
        }
        return out
    }

    private fun loadArticles(
        countryCode: String,
        countryName: String,
        constitutionTitle: String,
        version: VersionWire,
    ): List<IndexableArticle> {
        val pageSize = 200
        var offset = 0
        val articles = mutableListOf<IndexableArticle>()
        while (true) {
            val summaries = content.get()
                .uri("/versions/{id}/articles?offset={offset}&limit={limit}", version.id, offset, pageSize)
                .retrieve()
                .body(object : ParameterizedTypeReference<List<ArticleSummaryWire>>() {})
                .orEmpty()
            if (summaries.isEmpty()) {
                break
            }
            for (summary in summaries) {
                val detail = content.get()
                    .uri("/articles/{id}", summary.id)
                    .retrieve()
                    .body(ArticleDetailWire::class.java)
                    ?: continue
                articles += IndexableArticle(
                    articleId = detail.id,
                    versionId = detail.versionId,
                    countryCode = countryCode,
                    countryName = countryName,
                    constitutionTitle = constitutionTitle,
                    versionLabel = version.versionLabel,
                    effectiveDate = version.effectiveDate,
                    articleNumber = detail.articleNumber,
                    title = detail.title,
                    body = detail.body,
                )
            }
            if (summaries.size < pageSize) {
                break
            }
            offset += pageSize
        }
        return articles
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class CountrySummaryWire(
        val isoCode: String,
        val name: String = "",
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class CountryDetailWire(
        val name: String = "",
        val constitutions: List<ConstitutionWire> = emptyList(),
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class ConstitutionWire(
        val title: String = "",
        val versions: List<VersionWire> = emptyList(),
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class VersionWire(
        val id: UUID,
        val versionLabel: String = "",
        val effectiveDate: LocalDate? = null,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class ArticleSummaryWire(
        val id: UUID,
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class ArticleDetailWire(
        val id: UUID,
        val versionId: UUID,
        val articleNumber: String,
        val title: String,
        val body: String,
    )
}

@Configuration
class IndexSourceConfig {
    @Bean
    @ConditionalOnMissingBean(IndexSource::class)
    fun indexSource(
        @Value("\${catalog.api.url}") catalogUrl: String,
        @Value("\${content.api.url}") contentUrl: String,
    ): IndexSource = RestIndexSource(catalogUrl, contentUrl)
}

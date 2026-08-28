package com.constitutionatlas.search.client

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.ParameterizedTypeReference
import org.springframework.web.client.RestClient
import java.util.UUID

class RestIndexSource(
    catalogUrl: String,
    contentUrl: String,
) : IndexSource {
    private val catalog: RestClient = RestClient.builder().baseUrl(catalogUrl).build()
    private val content: RestClient = RestClient.builder().baseUrl(contentUrl).build()

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
            for (constitution in detail.constitutions) {
                for (version in constitution.versions) {
                    out += loadArticles(country.isoCode, version.id)
                }
            }
        }
        return out
    }

    private fun loadArticles(countryCode: String, versionId: UUID): List<IndexableArticle> {
        val pageSize = 200
        var offset = 0
        val articles = mutableListOf<IndexableArticle>()
        while (true) {
            val summaries = content.get()
                .uri("/versions/{id}/articles?offset={offset}&limit={limit}", versionId, offset, pageSize)
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
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class CountryDetailWire(
        val constitutions: List<ConstitutionWire> = emptyList(),
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class ConstitutionWire(
        val versions: List<VersionWire> = emptyList(),
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class VersionWire(
        val id: UUID,
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

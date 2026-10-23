package com.constitutionatlas.search.client

import com.constitutionatlas.platform.OrderedContentText
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.timedRestClient
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
        val roots = catalog.get().uri("/jurisdictions").retrieve()
            .body(object : ParameterizedTypeReference<List<JurisdictionWire>>() {}).orEmpty()
        val queue = ArrayDeque(roots)
        val seen = mutableSetOf<UUID>()
        val out = mutableListOf<IndexableArticle>()
        while (queue.isNotEmpty()) {
            val jurisdiction = queue.removeFirst()
            if (!seen.add(jurisdiction.id)) continue
            val detail = catalog.get().uri("/jurisdictions/{id}", jurisdiction.id).retrieve().body(JurisdictionDetailWire::class.java) ?: continue
            queue.addAll(detail.children)
            for (constitution in detail.constitutions) {
                for (version in constitution.versions) {
                    out += loadArticles(jurisdiction.code?.takeIf { jurisdiction.kind == "country" && !jurisdiction.historical && it.matches(Regex("[A-Z]{2}")) }.orEmpty(), jurisdiction.name, constitution.title, version, jurisdiction)
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
        jurisdiction: JurisdictionWire,
    ): List<IndexableArticle> {
        val pageSize = 200
        var offset = 0
        val articles = mutableListOf<IndexableArticle>()
        while (true) {
            val summaries = content.get()
                .uri("/versions/{id}/units?offset={offset}&limit={limit}", version.currentVersionId ?: version.id, offset, pageSize)
                .retrieve()
                .body(object : ParameterizedTypeReference<List<ArticleSummaryWire>>() {})
                .orEmpty()
            if (summaries.isEmpty()) {
                break
            }
            for (summary in summaries) {
                val detail = content.get()
                    .uri("/versions/{version}/units/{id}", version.currentVersionId ?: version.id, summary.id)
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
                    body = detail.content?.let(OrderedContentText::entries) ?: detail.body,
                    languageCode = version.languageCode.ifBlank { "en" },
                    jurisdictionId = jurisdiction.id,
                    jurisdictionName = jurisdiction.name,
                    historical = jurisdiction.historical,
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
    private data class JurisdictionWire(val id: UUID, val name: String, val code: String? = null, val historical: Boolean = false, val kind: String = "country")

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class JurisdictionDetailWire(val children: List<JurisdictionWire> = emptyList(), val constitutions: List<ConstitutionWire> = emptyList())

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class ConstitutionWire(
        val title: String = "",
        val versions: List<VersionWire> = emptyList(),
    )

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class VersionWire(
        val id: UUID,
        val currentVersionId: UUID? = null,
        val versionLabel: String = "",
        val effectiveDate: LocalDate? = null,
        val languageCode: String = "en",
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
        val content: List<OrderedEntry>? = null,
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

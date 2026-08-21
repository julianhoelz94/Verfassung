package com.constitutionatlas.ingestion.client

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class ClientConfig {
    @Bean
    @ConditionalOnMissingBean(CatalogClient::class)
    fun catalogClient(@Value("\${catalog.api.url}") catalogUrl: String): CatalogClient =
        RestCatalogClient(catalogUrl)

    @Bean
    @ConditionalOnMissingBean(ContentClient::class)
    fun contentClient(@Value("\${content.api.url}") contentUrl: String): ContentClient =
        RestContentClient(contentUrl)
}

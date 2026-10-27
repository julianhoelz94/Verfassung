package com.constitutionatlas.search.client

import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.net.InetSocketAddress
import java.util.UUID

class OrderedIndexSourceTest {
    @Test
    fun historicalAndRegionalCodesNeverBecomeCompatibleNationalRoutes() {
        for ((kind, historical, expectedCode) in listOf(Triple("country", false, "DE"), Triple("country", true, ""), Triple("region", false, ""))) {
            val jurisdiction = UUID.randomUUID()
            val version = UUID.randomUUID()
            val unit = UUID.randomUUID()
            val mapper = jacksonObjectMapper()
            val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
            server.createContext("/") { exchange ->
                val response: Any = when (exchange.requestURI.path) {
                    "/jurisdictions" -> listOf(mapOf("id" to jurisdiction, "name" to "Recorded jurisdiction", "code" to "DE", "kind" to kind, "historical" to historical))
                    "/jurisdictions/$jurisdiction" -> mapOf("children" to emptyList<Any>(), "constitutions" to listOf(mapOf("title" to "Source charter", "versions" to listOf(mapOf("id" to version, "versionLabel" to "Source")))))
                    "/versions/$version/units" -> listOf(mapOf("id" to unit))
                    else -> mapOf("id" to unit, "versionId" to version, "articleNumber" to "1", "title" to "Title", "body" to "Exact source text")
                }
                val bytes = mapper.writeValueAsBytes(response)
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(200, bytes.size.toLong())
                exchange.responseBody.use { it.write(bytes) }
            }
            server.start()
            try {
                val url = "http://127.0.0.1:${server.address.port}"
                val article = RestIndexSource(url, url).loadPublishedArticles().single()
                assertThat(article.jurisdictionId).isEqualTo(jurisdiction)
                assertThat(article.countryCode).isEqualTo(expectedCode)
            } finally {
                server.stop(0)
            }
        }
    }

    @Test
    fun indexesCurrentEditorialOccurrencesIndependentlyWhenRevisionsAreShared() {
        val jurisdiction = UUID.randomUUID()
        val firstLegal = UUID.randomUUID()
        val firstTip = UUID.randomUUID()
        val secondLegal = UUID.randomUUID()
        val firstOccurrence = UUID.randomUUID()
        val secondOccurrence = UUID.randomUUID()
        val logical = UUID.randomUUID()
        val revision = UUID.randomUUID()
        val requests = mutableListOf<String>()
        val mapper = jacksonObjectMapper()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val path = exchange.requestURI.path
            synchronized(requests) { requests += path }
            fun unit(version: UUID, occurrence: UUID) = mapOf("id" to occurrence, "versionId" to version, "articleNumber" to "46a", "title" to "Rights", "body" to "Wrong projection", "content" to listOf(mapOf("type" to "text", "logicalId" to logical, "revisionId" to revision, "occurrenceId" to UUID.randomUUID(), "text" to "Exact  shared text.\n")))
            val response: Any = when (path) {
                "/jurisdictions" -> listOf(mapOf("id" to jurisdiction, "code" to "DE", "name" to "Germany"))
                "/jurisdictions/$jurisdiction" -> mapOf("name" to "Germany", "constitutions" to listOf(mapOf("title" to "Constitution", "versions" to listOf(mapOf("id" to firstLegal, "currentVersionId" to firstTip, "versionLabel" to "1"), mapOf("id" to secondLegal, "versionLabel" to "2")))))
                "/versions/$firstTip/units" -> listOf(mapOf("id" to firstOccurrence))
                "/versions/$secondLegal/units" -> listOf(mapOf("id" to secondOccurrence))
                "/versions/$firstTip/units/$firstOccurrence" -> unit(firstTip, firstOccurrence)
                "/versions/$secondLegal/units/$secondOccurrence" -> unit(secondLegal, secondOccurrence)
                else -> mapOf("error" to "Unexpected request")
            }
            val bytes = mapper.writeValueAsBytes(response)
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(if (response is Map<*, *> && response.containsKey("error")) 404 else 200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            val indexed = RestIndexSource(url, url).loadPublishedArticles()
            assertThat(indexed.map { it.versionId }).containsExactly(firstTip, secondLegal)
            assertThat(indexed.map { it.articleId }).containsExactly(firstOccurrence, secondOccurrence)
            assertThat(indexed.map { it.jurisdictionId }).containsOnly(jurisdiction)
            assertThat(indexed.map { it.body }).containsExactly("Exact  shared text.\n", "Exact  shared text.\n")
            assertThat(requests).doesNotContain("/versions/$firstLegal/units")
        } finally {
            server.stop(0)
        }
    }
}

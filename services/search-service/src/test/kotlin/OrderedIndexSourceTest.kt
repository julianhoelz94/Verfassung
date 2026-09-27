package com.constitutionatlas.search.client

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID

class OrderedIndexSourceTest {
    @Test
    fun indexesCurrentEditorialOccurrencesIndependentlyWhenRevisionsAreShared() {
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
                "/countries" -> listOf(mapOf("isoCode" to "DE", "name" to "Germany"))
                "/countries/DE" -> mapOf("name" to "Germany", "constitutions" to listOf(mapOf("title" to "Constitution", "versions" to listOf(mapOf("id" to firstLegal, "currentVersionId" to firstTip, "versionLabel" to "1"), mapOf("id" to secondLegal, "versionLabel" to "2")))))
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
            assertThat(indexed.map { it.body }).containsExactly("Exact  shared text.\n", "Exact  shared text.\n")
            assertThat(requests).doesNotContain("/versions/$firstLegal/units")
        } finally {
            server.stop(0)
        }
    }
}

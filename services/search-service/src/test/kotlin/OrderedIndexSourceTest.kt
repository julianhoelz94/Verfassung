package com.constitutionatlas.search.client

import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.net.InetSocketAddress
import java.util.UUID

class OrderedIndexSourceTest {
    @Test
    fun usesCatalogOwnershipForCountryRoutesIncludingNonstandardSlugs() {
        data class Case(val kind: String, val historical: Boolean, val slug: String, val expectedCode: String)
        for ((kind, historical, slug, expectedCode) in listOf(Case("country", false, "de", "DE"), Case("country", true, "de", ""), Case("region", false, "de", ""), Case("country", false, "germany", ""))) {
            val jurisdiction = UUID.randomUUID()
            val version = UUID.randomUUID()
            val unit = UUID.randomUUID()
            val mapper = jacksonObjectMapper()
            val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
            server.createContext("/") { exchange ->
                val response: Any = when (exchange.requestURI.path) {
                    "/jurisdictions" -> listOf(mapOf("id" to jurisdiction, "name" to "Recorded jurisdiction", "code" to "DE", "kind" to kind, "historical" to historical, "slug" to slug))
                    "/jurisdictions/$jurisdiction" -> mapOf("children" to emptyList<Any>(), "constitutions" to listOf(mapOf("title" to "Source charter", "versions" to listOf(mapOf("id" to version, "versionLabel" to "Source")))))
                    "/versions/$version" -> mapOf("jurisdictionId" to jurisdiction, "countryCode" to expectedCode.ifBlank { null })
                    "/versions/$version/units" -> listOf(mapOf("id" to unit, "versionId" to version, "articleNumber" to "1", "title" to "Title", "body" to "Exact source text"))
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
                "/versions/$firstTip", "/versions/$secondLegal" -> mapOf("jurisdictionId" to jurisdiction, "countryCode" to "DE")
                "/versions/$firstTip/units" -> listOf(unit(firstTip, firstOccurrence))
                "/versions/$secondLegal/units" -> listOf(unit(secondLegal, secondOccurrence))
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

    @Test
    fun pagesThrough225FullBodiesWithoutFetchingEachProvisionSeparately() {
        val jurisdiction = UUID.randomUUID()
        val version = UUID.randomUUID()
        val ids = List(225) { UUID.randomUUID() }
        val pages = mutableListOf<Map<String, String>>()
        val mapper = jacksonObjectMapper()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val response: Any = when (exchange.requestURI.path) {
                "/jurisdictions" -> listOf(mapOf("id" to jurisdiction, "name" to "Test jurisdiction"))
                "/jurisdictions/$jurisdiction" -> mapOf("constitutions" to listOf(mapOf("title" to "Scale charter", "versions" to listOf(mapOf("id" to version, "versionLabel" to "Source")))))
                "/versions/$version" -> mapOf("jurisdictionId" to jurisdiction, "countryCode" to "XA")
                "/versions/$version/units" -> {
                    val query = exchange.requestURI.query.split('&').associate { it.substringBefore('=') to it.substringAfter('=') }
                    pages += query
                    val offset = query.getValue("offset").toInt()
                    ids.drop(offset).take(200).mapIndexed { index, id ->
                        mapOf("id" to id, "versionId" to version, "articleNumber" to (offset + index + 1).toString(), "title" to "", "body" to "Wrong projection", "content" to listOf(mapOf("type" to "text", "logicalId" to UUID.randomUUID(), "revisionId" to UUID.randomUUID(), "occurrenceId" to UUID.randomUUID(), "text" to "Exact provision ${offset + index + 1}.")))
                    }
                }
                else -> mapOf("error" to "Individual provision reads are forbidden by this fixture")
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
            assertThat(indexed.map { it.articleId }).containsExactlyElementsOf(ids)
            assertThat(indexed.last().body).isEqualTo("Exact provision 225.")
            assertThat(pages).containsExactly(mapOf("offset" to "0", "limit" to "200", "includeBody" to "true"), mapOf("offset" to "200", "limit" to "200", "includeBody" to "true"))
        } finally {
            server.stop(0)
        }
    }
}

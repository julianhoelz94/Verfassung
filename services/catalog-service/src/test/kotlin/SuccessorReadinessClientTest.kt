package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.platform.OrderedContentValidationException
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.OrderedInlineReference
import com.constitutionatlas.platform.OrderedNode
import com.constitutionatlas.platform.OrderedReferenceTarget
import com.constitutionatlas.platform.OrderedSnapshot
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.net.InetSocketAddress
import java.util.UUID

class SuccessorReadinessClientTest {
    private val version = UUID.randomUUID()
    private val noteId = UUID.randomUUID()

    @Test
    fun directPublicationChecksTheCompleteSnapshotAndAcceptsSharedNotesAcrossRoots() {
        for (count in 0..3) {
            val snapshot = snapshot(count)
            withSnapshot(snapshot) { client, requests ->
                repeat(2) {
                    if (count == 0) {
                        val error = assertThrows(OrderedContentValidationException::class.java) { client.requireValidContent(version, "Bearer publisher") }.errors.single()
                        assertThat(error.code).isEqualTo("FOOTNOTE_MARK_CARDINALITY")
                        assertThat(error.path).isEqualTo("roots[0].content[0]")
                        assertThat(error.logicalId).isEqualTo(noteId)
                    } else {
                        client.requireValidContent(version, "Bearer publisher")
                    }
                }
                assertThat(requests).containsExactly("/versions/$version/content:Bearer publisher", "/versions/$version/content:Bearer publisher")
            }
        }
    }

    @Test
    fun receiptPublicationAlsoChecksFootnoteMarkersInTheCompleteSnapshot() {
        val settings = UUID.randomUUID()
        val attempt = UUID.randomUUID()
        for (count in listOf(0, 2)) {
            withSnapshot(snapshot(count).copy(settingsRevisionId = settings)) { client, requests ->
                if (count == 0) {
                    val error = assertThrows(OrderedContentValidationException::class.java) { client.requireReady(version, attempt, settings, "Bearer publisher") }.errors.single()
                    assertThat(error.code).isEqualTo("FOOTNOTE_MARK_CARDINALITY")
                    assertThat(error.logicalId).isEqualTo(noteId)
                } else {
                    client.requireReady(version, attempt, settings, "Bearer publisher")
                }
                assertThat(requests).containsExactly("/versions/$version/publish-receipt:Bearer publisher")
            }
        }
    }

    @Test
    fun emptyContentKeepsItsExistingPublicationPolicyButUnknownNoteTargetsAreRejected() {
        withSnapshot(OrderedSnapshot(version, 0, null, emptyList())) { client, _ -> client.requireValidContent(version) }
        val entry = OrderedEntry("text", logicalId = UUID.randomUUID(), text = "Law", references = listOf(OrderedInlineReference(UUID.randomUUID(), 3, 3, OrderedReferenceTarget("footnote", footnoteId = noteId))))
        withSnapshot(OrderedSnapshot(version, 1, null, listOf(root(listOf(entry))))) { client, _ ->
            val error = assertThrows(OrderedContentValidationException::class.java) { client.requireValidContent(version) }.errors.single()
            assertThat(error.code).isEqualTo("INLINE_REFERENCE")
        }
    }

    @Test
    fun missingMismatchedAndUnavailableContentFailClosed() {
        withSnapshot(null, 204) { client, _ ->
            assertThat(assertThrows(ConflictException::class.java) { client.requireValidContent(version) }.code).isEqualTo("content_not_ready")
        }
        withSnapshot(snapshot(1).copy(versionId = UUID.randomUUID())) { client, _ ->
            assertThat(assertThrows(ConflictException::class.java) { client.requireValidContent(version) }.code).isEqualTo("content_not_ready")
        }
        withSnapshot(null, 503) { client, _ ->
            assertThat(assertThrows(ResponseStatusException::class.java) { client.requireValidContent(version) }.statusCode).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE)
        }
    }

    private fun snapshot(count: Int): OrderedSnapshot {
        val bodies = List(count) {
            root(listOf(OrderedEntry("text", logicalId = UUID.randomUUID(), text = "Law", references = listOf(OrderedInlineReference(UUID.randomUUID(), 3, 3, OrderedReferenceTarget("footnote", footnoteId = noteId))))))
        }
        return OrderedSnapshot(version, 1, null, bodies + root(listOf(OrderedEntry("text", logicalId = noteId, text = "Shared source note", format = "footnote"))))
    }

    private fun root(entries: List<OrderedEntry>) = OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "article", null, null, entries)

    private fun withSnapshot(snapshot: OrderedSnapshot?, status: Int = 200, action: (SuccessorReadinessClient, List<String>) -> Unit) {
        val requests = mutableListOf<String>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            requests += "${exchange.requestURI.path}:${exchange.requestHeaders.getFirst("Authorization") ?: ""}"
            val bytes = snapshot?.let { jacksonObjectMapper().writeValueAsBytes(it) } ?: byteArrayOf()
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            action(SuccessorReadinessClient("http://127.0.0.1:${server.address.port}"), requests)
        } finally {
            server.stop(0)
        }
    }
}

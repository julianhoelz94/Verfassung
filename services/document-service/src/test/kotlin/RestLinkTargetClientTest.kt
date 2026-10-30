import com.constitutionatlas.document.service.RestLinkTargetClient
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

class RestLinkTargetClientTest {
    @Test
    fun publishedEditorialSnapshotsKeepPublicDocumentLinksAfterAnotherCorrection() {
        val versionId = UUID.randomUUID()
        val currentId = UUID.randomUUID()
        withVersionResponse(200, """{"id":"$versionId","currentVersionId":"$currentId","publicationStatus":"published","listing":"staff"}""") { client ->
            assertThat(client.isPublic("version", versionId, null)).isTrue()
        }
    }

    @Test
    fun draftOrMissingVersionsDoNotExposeDocumentLinks() {
        val versionId = UUID.randomUUID()
        withVersionResponse(200, """{"publicationStatus":"draft","listing":"public"}""") { client ->
            assertThat(client.isPublic("version", versionId, null)).isFalse()
        }
        withVersionResponse(404, """{"error":"Unknown version"}""") { client ->
            assertThat(client.isPublic("version", versionId, null)).isFalse()
        }
    }

    @Test
    fun amendmentVisibilityRequiresAnExactScalarPublishedRevision() {
        val amendment = UUID.randomUUID()
        val scope = UUID.randomUUID()
        val path = "/amendments/$amendment"
        val responses = mutableMapOf(path to """{"publishedRevisionId":"$scope"}""")
        withResponses(responses) { client, _ ->
            assertThat(client.isPublic("amendment", amendment, scope)).isTrue()
            assertThat(client.isPublic("amendment", amendment, UUID.randomUUID())).isFalse()
            assertThat(client.publishedAmendmentRevision(amendment)).isEqualTo(scope)
            for (malformed in listOf("{}", "[]", "null", "\"invalid-uuid\"")) {
                responses[path] = """{"publishedRevisionId":$malformed}"""
                assertThat(client.isPublic("amendment", amendment, scope)).isFalse()
                assertThat(client.publishedAmendmentRevision(amendment)).isNull()
            }
        }
    }

    @Test
    fun onlyTheCurrentAmendmentRevisionCanChangeLinksAndPublishedPinsStayImmutable() {
        val amendment = UUID.randomUUID()
        val previous = UUID.randomUUID()
        val scope = UUID.randomUUID()
        val ownerPath = "/amendments/$amendment"
        val revisionsPath = "$ownerPath/revisions"
        val responses = mutableMapOf(
            ownerPath to """{"publishedRevisionId":"$previous"}""",
            revisionsPath to """[{"id":"$previous"},{"id":"$scope"}]""",
        )
        withResponses(responses) { client, calls ->
            client.requireAmendmentRevision(amendment, scope, "Bearer editor", false)
            assertThat(calls).contains(ownerPath to "Bearer editor", revisionsPath to "Bearer editor")
            responses[ownerPath] = """{"publishedRevisionId":"$scope"}"""
            val published = assertThrows(IllegalArgumentException::class.java) {
                client.requireAmendmentRevision(amendment, scope, "Bearer editor", false)
            }
            assertThat(published.message).contains("Published amendment links are immutable")
            client.requireAmendmentRevision(amendment, scope, "Bearer editor", true)
            responses[revisionsPath] = """[{"id":"$previous"},{"id":{}}]"""
            val malformed = assertThrows(IllegalArgumentException::class.java) {
                client.requireAmendmentRevision(amendment, scope, "Bearer editor", true)
            }
            assertThat(malformed.message).contains("Only the current amendment draft")
        }
    }

    @Test
    fun wikiVisibilityRequiresTheRequestedPublishedRevision() {
        for (kind in listOf("country", "constitution", "jurisdiction")) {
            val target = UUID.randomUUID()
            val scope = UUID.randomUUID()
            val path = "/wiki/$kind/$target"
            val responses = mutableMapOf(path to """{"id":"$scope"}""")
            withResponses(responses) { client, _ ->
                assertThat(client.isPublic("${kind}_wiki", target, scope)).isTrue()
                assertThat(client.isPublic("${kind}_wiki", target, UUID.randomUUID())).isFalse()
                responses[path] = """{"id":[]}"""
                assertThat(client.isPublic("${kind}_wiki", target, scope)).isFalse()
                responses.remove(path)
                assertThat(client.isPublic("${kind}_wiki", target, scope)).isFalse()
            }
        }
    }

    @Test
    fun wikiImageWritesRequireTheCurrentUnpublishedDraftAndForwardAuthorization() {
        for (kind in listOf("country", "constitution", "jurisdiction")) {
            val target = UUID.randomUUID()
            val scope = UUID.randomUUID()
            val publicPath = "/wiki/$kind/$target"
            val draftPath = "$publicPath/draft"
            val responses = mutableMapOf(
                draftPath to """{"id":"$scope"}""",
                publicPath to """{"id":"${UUID.randomUUID()}"}""",
            )
            withResponses(responses) { client, calls ->
                client.requireWikiRevision("${kind}_wiki", target, scope, "Bearer editor")
                assertThat(calls).contains(draftPath to "Bearer editor", publicPath to null)
                responses[publicPath] = """{"id":"$scope"}"""
                val published = assertThrows(IllegalArgumentException::class.java) {
                    client.requireWikiRevision("${kind}_wiki", target, scope, "Bearer editor")
                }
                assertThat(published.message).contains("Published wiki image links are immutable")
                responses[draftPath] = """{"id":{}}"""
                val malformed = assertThrows(IllegalArgumentException::class.java) {
                    client.requireWikiRevision("${kind}_wiki", target, scope, "Bearer editor")
                }
                assertThat(malformed.message).contains("Only the current wiki draft")
            }
        }
    }

    @Test
    fun publicWikiImagesMustMatchBothDocumentIdentityAndRevision() {
        for (kind in listOf("country", "constitution", "jurisdiction")) {
            val target = UUID.randomUUID()
            val scope = UUID.randomUUID()
            val document = UUID.randomUUID()
            val path = "/wiki/$kind/$target/revisions/$scope"
            val responses = mutableMapOf(path to """{"id":"$scope","images":[{"documentId":"${UUID.randomUUID()}","revision":3},{"documentId":"$document","revision":3}]}""")
            withResponses(responses) { client, _ ->
                assertThat(client.isWikiImagePublic("${kind}_wiki", target, scope, document, 3)).isTrue()
                assertThat(client.isWikiImagePublic("${kind}_wiki", target, scope, document, 4)).isFalse()
                for (image in listOf("""{"documentId":"$document","revision":{}}""", """{"documentId":[],"revision":3}""")) {
                    responses[path] = """{"id":"$scope","images":[$image]}"""
                    assertThat(client.isWikiImagePublic("${kind}_wiki", target, scope, document, 3)).isFalse()
                }
                responses[path] = """{"id":[],"images":[{"documentId":"$document","revision":3}]}"""
                assertThat(client.isWikiImagePublic("${kind}_wiki", target, scope, document, 3)).isFalse()
                responses.remove(path)
                assertThat(client.isWikiImagePublic("${kind}_wiki", target, scope, document, 3)).isFalse()
            }
        }
    }

    private fun withResponses(responses: Map<String, String>, verify: (RestLinkTargetClient, List<Pair<String, String?>>) -> Unit) {
        val calls = CopyOnWriteArrayList<Pair<String, String?>>()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val path = exchange.requestURI.path
            calls += path to exchange.requestHeaders.getFirst("Authorization")
            val body = responses[path]
            val bytes = (body ?: """{"error":"Not found"}""").toByteArray(Charsets.UTF_8)
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(if (body == null) 404 else 200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            verify(RestLinkTargetClient(url, url), calls)
        } finally {
            server.stop(0)
        }
    }

    private fun withVersionResponse(status: Int, body: String, verify: (RestLinkTargetClient) -> Unit) {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/versions/") { exchange ->
            val bytes = body.toByteArray(Charsets.UTF_8)
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            verify(RestLinkTargetClient(url, url))
        } finally {
            server.stop(0)
        }
    }
}

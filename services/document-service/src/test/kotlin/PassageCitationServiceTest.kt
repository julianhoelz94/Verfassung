import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.DocumentRevisionDto
import com.constitutionatlas.document.repo.DocumentRepository
import com.constitutionatlas.document.service.DocumentService
import com.constitutionatlas.document.service.PassageCitationService
import com.constitutionatlas.document.service.RestLinkTargetClient
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.OrderedInlineReference
import com.constitutionatlas.platform.OrderedNode
import com.constitutionatlas.platform.OrderedReferenceTarget
import com.constitutionatlas.platform.OrderedSnapshot
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.net.InetSocketAddress
import java.time.OffsetDateTime
import java.util.UUID

class PassageCitationServiceTest {
    @Test
    fun synchronizationResolvesEveryExactRevisionBeforeWritingAndPublicReadsCheckTheActualPublishedSnapshot() {
        val identity = Mockito.mock(IdentityClient::class.java)
        val documents = Mockito.mock(DocumentService::class.java)
        val repository = Mockito.mock(DocumentRepository::class.java)
        val actor = Actor(UUID.randomUUID(), "publisher@example.test", listOf("publisher"))
        Mockito.`when`(identity.authenticate("Bearer publisher")).thenReturn(actor)
        Mockito.`when`(identity.authenticate("Bearer reviewer")).thenReturn(actor.copy(roles = listOf("reviewer")))
        val version = UUID.randomUUID()
        val document = UUID.randomUUID()
        fun entry(revision: Int) = OrderedEntry("text", logicalId = UUID.randomUUID(), text = "Law", references = listOf(OrderedInlineReference(UUID.randomUUID(), 0, 3, OrderedReferenceTarget("document", documentId = document, documentRevision = revision))))
        var snapshot = OrderedSnapshot(version, 7, null, listOf(OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "article", null, null, listOf(entry(1), entry(2)))))
        var published = false
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            val bytes = if (exchange.requestURI.path.endsWith("/content")) jacksonObjectMapper().writeValueAsBytes(snapshot) else """{"publicationStatus":"${if (published) "published" else "draft"}"}""".toByteArray()
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val url = "http://127.0.0.1:${server.address.port}"
            val service = PassageCitationService(identity, documents, repository, url)
            assertThrows(ForbiddenException::class.java) { service.synchronize(version, 7, "Bearer reviewer") }
            assertThrows(DocumentConflictException::class.java) { service.synchronize(version, 6, "Bearer publisher") }
            val pins = (1..2).map { number ->
                val revision = DocumentRevisionDto(UUID.randomUUID(), document, number, "Law $number", null, null, "law.pdf", "application/pdf", OffsetDateTime.now(), actor.id)
                DocumentDto(document, 2, "active", OffsetDateTime.now(), revision)
            }
            Mockito.`when`(documents.get(document, 1)).thenReturn(pins[0])
            Mockito.`when`(documents.get(document, 2)).thenThrow(NotFoundException("Missing pin"))
            assertThrows(NotFoundException::class.java) { service.synchronize(version, 7, "Bearer publisher") }
            assertThat(Mockito.mockingDetails(repository).invocations.none { it.method.name == "linkEvent" }).isTrue()
            Mockito.doReturn(pins[1]).`when`(documents).get(document, 2)
            service.synchronize(version, 7, "Bearer publisher")
            pins.forEach { pin -> Mockito.verify(repository).linkEvent("passage_citation", version, pin.revision.id, document, pin.revision.id, "attach", actor.id) }
            val targets = RestLinkTargetClient(url, url, url, url)
            assertThat(targets.isPassageCitationPublic(version, document, 1)).isFalse()
            published = true
            assertThat(targets.isPassageCitationPublic(version, document, 1)).isTrue()
            assertThat(targets.isPassageCitationPublic(version, document, 2)).isTrue()
            snapshot = snapshot.copy(roots = emptyList())
            assertThat(targets.isPassageCitationPublic(version, document, 1)).isFalse()
        } finally {
            server.stop(0)
        }
    }
}

import com.constitutionatlas.document.DocumentServiceApplication
import com.constitutionatlas.document.service.LinkTargetClient
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [DocumentServiceApplication::class])
class DocumentAttachmentApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var mapper: ObjectMapper

    @MockitoBean lateinit var identity: IdentityClient

    @MockitoBean lateinit var targets: LinkTargetClient

    @BeforeEach
    fun identities() {
        Mockito.reset(identity, targets)
        Mockito.`when`(identity.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identity.authenticate(EDITOR)).thenReturn(Actor(UUID.randomUUID(), "editor@example.local", listOf("editor")))
        Mockito.`when`(identity.authenticate(PUBLISHER)).thenReturn(Actor(UUID.randomUUID(), "publisher@example.local", listOf("publisher")))
    }

    @Test
    fun manifestsReuseBytesAcrossMetadataChangesAndKeepHistoricalPrimaryDownloads() {
        val id = create().path("id").asText()
        val firstText = "Original source ${UUID.randomUUID()}"
        val supplementText = "Supplement ${UUID.randomUUID()}"
        val first = upload(id, 1, "source.txt", firstText)
        val firstFile = first.path("revision").path("attachments")[0].path("id").asText()
        val second = upload(id, 2, "notes.txt", supplementText)
        assertEquals(2, second.path("revision").path("attachments").size())
        assertEquals("source.txt", second.path("revision").path("fileName").asText())
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Corrected bibliography","expectedRevision":3}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.revision.attachments.length()") { value(2) }
            jsonPath("$.revision.attachments[0].id") { value(firstFile) }
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM document_files WHERE id = ?::uuid", Int::class.java, firstFile))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM document_revisions WHERE document_id = ?::uuid AND revision > 1 AND file_bytes IS NOT NULL", Int::class.java, id))
        mvc.get("/documents/$id/revisions/2/file") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            content { bytes(firstText.toByteArray()) }
        }
        mvc.get("/documents/$id/revisions/4/attachments/$firstFile/file") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            content { bytes(firstText.toByteArray()) }
            header { string("X-Content-Type-Options", "nosniff") }
        }
        val replacement = mvc.perform(
            multipart("/documents/$id/file").file(MockMultipartFile("file", "replacement.txt", "text/plain", "Replacement".toByteArray()))
                .param("expectedRevision", "4").header("Authorization", EDITOR),
        ).andExpect(status().isOk).andReturn().response
        val changed = mapper.readTree(replacement.contentAsString)
        assertEquals(2, changed.path("revision").path("attachments").size())
        assertEquals("replacement.txt", changed.path("revision").path("fileName").asText())
        mvc.get("/documents/$id/revisions/5/attachments/$firstFile/file") { header("Authorization", EDITOR) }.andExpect { status { isNotFound() } }
        mvc.get("/documents/$id/revisions/4/attachments/$firstFile/file") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }
    }

    @Test
    fun changingAndRemovingPrimaryPreservesPublicPinnedManifestAndLastRemovalClearsFile() {
        val id = create().path("id").asText()
        val first = upload(id, 1, "first.txt", "First")
        val firstFile = first.path("revision").path("attachments")[0].path("id").asText()
        val second = upload(id, 2, "second.txt", "Second")
        val secondFile = second.path("revision").path("attachments")[1].path("id").asText()
        val target = UUID.randomUUID()
        Mockito.`when`(targets.isPublic("constitution", target, null)).thenReturn(true)
        mvc.post("/links/constitution/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"documentId":"$id","revisionId":"${second.path("revision").path("id").asText()}"}"""
        }.andExpect { status { isOk() } }
        mvc.put("/documents/$id/attachments/$secondFile/primary?expectedRevision=3") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.revision.fileName") { value("second.txt") }
        }
        mvc.delete("/documents/$id/attachments/$secondFile?expectedRevision=4") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.revision.fileName") { value("first.txt") }
        }
        mvc.delete("/documents/$id/attachments/$firstFile?expectedRevision=5") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.revision.attachments.length()") { value(0) }
            jsonPath("$.revision.fileName") { doesNotExist() }
        }
        mvc.get("/documents/$id/revisions/3/attachments/$secondFile/file").andExpect {
            status { isOk() }
            content { bytes("Second".toByteArray()) }
        }
        mvc.get("/documents/$id/revisions/4/attachments/$secondFile/file").andExpect { status { isNotFound() } }
        mvc.get("/documents/$id/revisions/6/file") { header("Authorization", EDITOR) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun invalidContentStaleEditsAndPublisherMutationNeverAdvanceRevision() {
        val id = create().path("id").asText()
        fun upload(authorization: String = EDITOR, expected: Int = 1, mime: String = "application/pdf", bytes: ByteArray = "pretend PDF".toByteArray()) =
            mvc.perform(
                multipart("/documents/$id/attachments").file(MockMultipartFile("file", "source.pdf", mime, bytes))
                    .param("expectedRevision", expected.toString()).header("Authorization", authorization),
            )
        upload().andExpect(status().isBadRequest)
        upload(PUBLISHER).andExpect(status().isForbidden)
        upload(mime = "text/plain", bytes = "Valid text".toByteArray()).andExpect(status().isOk)
        upload(expected = 1, mime = "text/plain", bytes = "Other text".toByteArray()).andExpect(status().isConflict)
        mvc.get("/documents/$id") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.currentRevision") { value(2) }
            jsonPath("$.revision.attachments.length()") { value(1) }
        }
    }

    private fun create(): JsonNode = mapper.readTree(
        mvc.post("/documents") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Attachment test ${UUID.randomUUID()}"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
    )

    private fun upload(id: String, expected: Int, name: String, content: String): JsonNode = mapper.readTree(
        mvc.perform(
            multipart("/documents/$id/attachments").file(MockMultipartFile("file", name, "text/plain", content.toByteArray()))
                .param("expectedRevision", expected.toString()).header("Authorization", EDITOR),
        ).andExpect(status().isOk).andReturn().response.contentAsString,
    )

    companion object {
        private const val EDITOR = "Bearer editor"
        private const val PUBLISHER = "Bearer publisher"

        @Container @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

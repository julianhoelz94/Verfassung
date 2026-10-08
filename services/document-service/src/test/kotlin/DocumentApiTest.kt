import com.constitutionatlas.document.DocumentServiceApplication
import com.constitutionatlas.document.service.LinkTargetClient
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [DocumentServiceApplication::class])
class DocumentApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @MockBean lateinit var identity: IdentityClient

    @MockBean lateinit var targets: LinkTargetClient

    private val editor = Actor(UUID.randomUUID(), "editor@example.local", listOf("editor"))
    private val viewer = Actor(UUID.randomUUID(), "viewer@example.local", listOf("viewer"))

    @BeforeEach
    fun identity() {
        Mockito.reset(identity, targets)
        Mockito.`when`(identity.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identity.authenticate(EDITOR)).thenReturn(editor)
        Mockito.`when`(identity.authenticate(VIEWER)).thenReturn(viewer)
    }

    private fun create(): Pair<String, String> {
        val body = mvc.post("/documents") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Official gazette","sourceUrl":"https://example.org/gazette"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val json = mapper.readTree(body)
        return json["id"].asText() to json["revision"]["id"].asText()
    }

    @Test
    fun wikiImageStaysPrivateUntilItsRevisionIsPublished() {
        val (id, _) = create()
        val png = java.util.Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/GZkAAAAASUVORK5CYII=",
        )
        val uploaded = mvc.perform(
            multipart("/documents/$id/file")
                .file(MockMultipartFile("file", "flag.png", "image/png", png))
                .param("expectedRevision", "1")
                .header("Authorization", EDITOR),
        ).andExpect(status().isOk).andReturn()
        val pinnedId = mapper.readTree(uploaded.response.contentAsString)["revision"]["id"].asText()
        val target = UUID.randomUUID()
        val scope = UUID.randomUUID()
        mvc.post("/links/country_wiki/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"documentId":"$id","revisionId":"$pinnedId","scopeRevisionId":"$scope"}"""
        }.andExpect { status { isOk() } }
        mvc.get("/documents/$id/revisions/2/file").andExpect { status { isNotFound() } }
        Mockito.`when`(targets.isPublic("country_wiki", target, scope)).thenReturn(true)
        Mockito.`when`(targets.isWikiImagePublic("country_wiki", target, scope, UUID.fromString(id), 2)).thenReturn(true)
        mvc.get("/documents/$id/revisions/2/file").andExpect {
            status { isOk() }
            header { string("Content-Disposition", org.hamcrest.Matchers.containsString("inline")) }
        }
        mvc.perform(
            multipart("/documents/$id/file")
                .file(MockMultipartFile("file", "replacement.png", "image/png", png))
                .param("expectedRevision", "2")
                .header("Authorization", EDITOR),
        ).andExpect(status().isOk)
        mvc.get("/documents/$id/revisions/3/file").andExpect { status { isNotFound() } }
        mvc.get("/documents/$id/revisions/2/file").andExpect { status { isOk() } }
    }

    @Test
    fun revisionsAreImmutableAndConflictsAreReported() {
        val (id, firstRevision) = create()
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Corrected gazette","expectedRevision":1}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.currentRevision") { value(2) }
        }
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Stale","expectedRevision":1}"""
        }.andExpect { status { isConflict() } }
        mvc.get("/documents/$id?revision=1") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.revision.id") { value(firstRevision) }
            jsonPath("$.revision.title") { value("Official gazette") }
        }
        mvc.get("/documents/$id/revisions") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
        }
    }

    @Test
    fun writesRequireStaffIdentity() {
        mvc.post("/documents") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Test"}"""
        }
            .andExpect { status { isUnauthorized() } }
        mvc.post("/documents") {
            header("Authorization", VIEWER)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Test"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun unpublishedDocumentsAndRevisionHistoryArePrivate() {
        val (id, _) = create()
        mvc.get("/documents/$id").andExpect { status { isNotFound() } }
        mvc.get("/documents").andExpect { status { isUnauthorized() } }
        mvc.get("/documents/$id/revisions").andExpect { status { isUnauthorized() } }
        mvc.get("/documents/$id/revisions") { header("Authorization", VIEWER) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun publicCitationExposesOnlyItsPinnedRevisionAndFile() {
        val (id, _) = create()
        val file = MockMultipartFile("file", "gazette.txt", "text/plain", "Public source".toByteArray())
        val uploaded = mvc.perform(multipart("/documents/$id/file").file(file).param("expectedRevision", "1").header("Authorization", EDITOR))
            .andExpect(status().isOk)
            .andReturn()
        val pinnedId = mapper.readTree(uploaded.response.contentAsString)["revision"]["id"].asText()
        val target = UUID.randomUUID()
        Mockito.`when`(targets.isPublic("constitution", target, null)).thenReturn(true)
        mvc.post("/links/constitution/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"documentId":"$id","revisionId":"$pinnedId"}"""
        }.andExpect { status { isOk() } }
        mvc.get("/documents/$id?revision=2").andExpect { status { isOk() } }
        mvc.get("/documents/$id/revisions/2/file").andExpect {
            status { isOk() }
            content { bytes("Public source".toByteArray()) }
        }
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"New internal notes","expectedRevision":2}"""
        }.andExpect { status { isOk() } }
        mvc.get("/documents/$id").andExpect { status { isNotFound() } }
        mvc.get("/documents/$id/revisions/3/file").andExpect { status { isNotFound() } }
        mvc.get("/documents/$id?revision=2").andExpect { status { isOk() } }
    }

    @Test
    fun amendmentLinksAreIsolatedByRevision() {
        val (id, revisionId) = create()
        val target = UUID.randomUUID()
        val draft = UUID.randomUUID()
        val published = UUID.randomUUID()
        Mockito.`when`(targets.amendmentAncestry(target, draft, EDITOR)).thenReturn(listOf(draft))
        Mockito.`when`(targets.amendmentAncestry(target, published, EDITOR)).thenReturn(listOf(published))
        mvc.post("/links/amendment/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"documentId":"$id","revisionId":"$revisionId","scopeRevisionId":"$draft"}"""
        }.andExpect { status { isOk() } }
        mvc.get("/links/amendment/$target?scopeRevisionId=$published") { header("Authorization", EDITOR) }
            .andExpect { jsonPath("$.length()") { value(0) } }
        mvc.get("/links/amendment/$target?scopeRevisionId=$draft") { header("Authorization", EDITOR) }
            .andExpect { jsonPath("$.length()") { value(1) } }
        mvc.post("/links/amendment/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"documentId":"$id","revisionId":"$revisionId"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun amendmentSuccessorInheritsLinksAndCanDetachWithoutChangingPredecessor() {
        val (id, revisionId) = create()
        val target = UUID.randomUUID()
        val draft = UUID.randomUUID()
        val successor = UUID.randomUUID()
        Mockito.`when`(targets.amendmentAncestry(target, draft, EDITOR)).thenReturn(listOf(draft))
        Mockito.`when`(targets.amendmentAncestry(target, successor, EDITOR)).thenReturn(listOf(draft, successor))
        mvc.post("/links/amendment/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"documentId":"$id","revisionId":"$revisionId","scopeRevisionId":"$draft"}"""
        }.andExpect { status { isOk() } }
        mvc.get("/links/amendment/$target?scopeRevisionId=$successor") { header("Authorization", EDITOR) }
            .andExpect { jsonPath("$.length()") { value(1) } }
        mvc.delete("/links/amendment/$target/$id?scopeRevisionId=$successor") { header("Authorization", EDITOR) }
            .andExpect { jsonPath("$.length()") { value(0) } }
        mvc.get("/links/amendment/$target?scopeRevisionId=$draft") { header("Authorization", EDITOR) }
            .andExpect { jsonPath("$.length()") { value(1) } }
    }

    @Test
    fun fileUploadCreatesDownloadableHistoricalRevision() {
        val (id, _) = create()
        val file = MockMultipartFile("file", "source.txt", "text/plain", "Source bytes".toByteArray())
        mvc.perform(multipart("/documents/$id/file").file(file).param("expectedRevision", "1").header("Authorization", EDITOR))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.currentRevision").value(2))
        mvc.get("/documents/$id/revisions/2/file") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            content { bytes("Source bytes".toByteArray()) }
        }
        mvc.get("/documents/$id/revisions/2/file").andExpect { status { isNotFound() } }
        mvc.get("/documents/$id/revisions/1/file") { header("Authorization", EDITOR) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun linksKeepAppendOnlyHistoryAndPinnedRevision() {
        val (id, revisionId) = create()
        val target = UUID.randomUUID()
        mvc.post("/links/constitution/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"documentId":"$id","revisionId":"$revisionId"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].revisionId") { value(revisionId) }
        }
        mvc.get("/links/constitution/$target") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
        }
        mvc.delete("/links/constitution/$target/$id") { header("Authorization", EDITOR) }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(0) }
            }
        mvc.get("/links/constitution/$target/events") { header("Authorization", EDITOR) }
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(2) }
            }
        Mockito.verify(targets, Mockito.times(2)).requireTarget("constitution", target, EDITOR)
    }

    companion object {
        private const val EDITOR = "Bearer editor"
        private const val VIEWER = "Bearer viewer"

        @Container @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

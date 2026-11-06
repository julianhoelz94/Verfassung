import com.constitutionatlas.document.DocumentServiceApplication
import com.constitutionatlas.document.service.BibtexParser
import com.constitutionatlas.document.service.LinkTargetClient
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import java.util.concurrent.Executors

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [DocumentServiceApplication::class])
class DocumentLibraryApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @MockitoBean lateinit var identity: IdentityClient

    @MockitoBean lateinit var targets: LinkTargetClient

    @BeforeEach
    fun setup() {
        Mockito.reset(identity, targets)
        Mockito.`when`(identity.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        for (role in listOf("editor", "admin", "reviewer", "publisher", "viewer")) {
            Mockito.`when`(identity.authenticate("Bearer $role")).thenReturn(Actor(UUID.randomUUID(), "$role@example.local", listOf(role)))
        }
    }

    @Test
    fun publisherAndReviewerCanInspectButCannotMutateLibrary() {
        for (role in listOf("publisher", "reviewer")) {
            mvc.get("/library/documents") { header("Authorization", "Bearer $role") }.andExpect { status { isOk() } }
            mvc.post("/documents") {
                header("Authorization", "Bearer $role")
                contentType = MediaType.APPLICATION_JSON
                content = """{"title":"Forbidden"}"""
            }.andExpect { status { isForbidden() } }
            mvc.post("/library/folders") {
                header("Authorization", "Bearer $role")
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"Forbidden"}"""
            }.andExpect { status { isForbidden() } }
        }
        mvc.get("/library/documents") { header("Authorization", "Bearer viewer") }.andExpect { status { isForbidden() } }
        mvc.get("/library/documents").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun simultaneousKeyClaimsAreUniqueAndRenamingRetainsAliasesAndHistoricalKey() {
        val key = "Race${UUID.randomUUID()}"
        val pool = Executors.newFixedThreadPool(2)
        try {
            val results = listOf(key, key.lowercase()).map { value ->
                pool.submit<Pair<Int, String>> {
                    val response = mvc.post("/documents") {
                        header("Authorization", EDITOR)
                        contentType = MediaType.APPLICATION_JSON
                        content = mapper.writeValueAsString(mapOf("title" to value, "citationKey" to value))
                    }.andReturn().response
                    response.status to response.contentAsString
                }
            }.map { it.get() }
            assertEquals(listOf(201, 409), results.map { it.first }.sorted())
            val created = mapper.readTree(results.first { it.first == 201 }.second)
            val id = created.path("id").asText()
            val original = created.path("citationKey").asText()
            val next = "Renamed${UUID.randomUUID()}"
            mvc.put("/documents/$id") {
                header("Authorization", EDITOR)
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("title" to "Changed", "citationKey" to next, "expectedRevision" to 1))
            }.andExpect {
                status { isOk() }
                jsonPath("$.citationKey") { value(next) }
            }
            mvc.get("/library/keys/$original") { header("Authorization", EDITOR) }.andExpect {
                status { isOk() }
                jsonPath("$.id") { value(id) }
            }
            mvc.get("/library/key-availability?key=$original") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.available") { value(false) } }
            mvc.get("/documents/$id?revision=1") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.revision.citationKey") { value(original) } }
            mvc.post("/documents") {
                header("Authorization", EDITOR)
                contentType = MediaType.APPLICATION_JSON
                content = """{"title":"Alias conflict","citationKey":"$original"}"""
            }.andExpect { status { isConflict() } }
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun folderMembershipIsAdditiveAndDeletionPreservesTagsDocumentsAndRevisions() {
        val doc = create()
        val id = doc.path("id").asText()
        val folderA = folder("A ${UUID.randomUUID()}")
        val folderB = folder("B ${UUID.randomUUID()}")
        for (f in listOf(folderA, folderB)) {
            val tagId = f.path("tagId").asText()
            mvc.put("/library/documents/$id/tags/$tagId") { header("Authorization", EDITOR) }.andExpect {
                status { isOk() }
                jsonPath("$.currentRevision") { value(1) }
            }
            mvc.put("/library/documents/$id/tags/$tagId") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }
            mvc.get("/library/documents?folderId=${f.path("id").asText()}") { header("Authorization", EDITOR) }.andExpect {
                jsonPath("$.total") { value(1) }
                jsonPath("$.items[0].id") { value(id) }
            }
        }
        mvc.get("/documents/$id") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.tags.length()") { value(2) } }
        mvc.delete("/library/documents/$id/tags/${folderA.path("tagId").asText()}") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.tags.length()") { value(1) } }
        mvc.get("/library/documents?folderId=${folderB.path("id").asText()}") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.total") { value(1) } }
        mvc.put("/library/folders/${folderB.path("id").asText()}") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Renamed ${UUID.randomUUID()}"}"""
        }.andExpect { status { isOk() } }
        mvc.delete("/library/folders/${folderB.path("id").asText()}") { header("Authorization", EDITOR) }.andExpect { status { isNoContent() } }
        mvc.get("/library/documents?tagId=${folderB.path("tagId").asText()}") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.total") { value(1) } }
        mvc.get("/documents/$id") { header("Authorization", EDITOR) }.andExpect {
            jsonPath("$.currentRevision") { value(1) }
            jsonPath("$.tags.length()") { value(1) }
        }
    }

    @Test
    fun foldersCanReuseUnownedTagsAndBeRecreatedWithoutLosingMemberships() {
        val name = "Reusable project ${UUID.randomUUID()}"
        val tag = mapper.readTree(
            mvc.post("/library/tags") {
                header("Authorization", EDITOR)
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("name" to name))
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )
        val tagId = tag.path("id").asText()
        val id = create().path("id").asText()
        mvc.put("/library/documents/$id/tags/$tagId") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }
        val original = folder(name.lowercase())
        val folderId = original.path("id").asText()
        assertEquals(tagId, original.path("tagId").asText())
        mvc.get("/library/documents?folderId=$folderId") { header("Authorization", EDITOR) }.andExpect {
            jsonPath("$.total") { value(1) }
            jsonPath("$.items[0].id") { value(id) }
        }
        // A differently named folder must not take over the same tag after its owner is renamed.
        mvc.put("/library/folders/$folderId") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(mapOf("name" to "Renamed $name"))
        }.andExpect { status { isOk() } }
        mvc.post("/library/folders") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(mapOf("name" to name))
        }.andExpect { status { isConflict() } }
        mvc.get("/library/documents?folderId=$folderId") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.items[0].id") { value(id) } }
        mvc.delete("/library/folders/$folderId") { header("Authorization", EDITOR) }.andExpect { status { isNoContent() } }
        val recreated = folder(name)
        assertEquals(tagId, recreated.path("tagId").asText())
        mvc.get("/library/documents?folderId=${recreated.path("id").asText()}") { header("Authorization", EDITOR) }.andExpect {
            jsonPath("$.total") { value(1) }
            jsonPath("$.items[0].id") { value(id) }
            jsonPath("$.items[0].currentRevision") { value(1) }
        }
    }

    @Test
    fun bibliographySupportsSearchPaginationAndLegacyMetadataUpdates() {
        val unique = "Scholar${UUID.randomUUID()}"
        val created = mvc.post("/documents") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(mapOf("title" to "A paper", "citationKey" to unique, "bibliography" to mapOf("type" to "article", "authors" to listOf(mapOf("family" to unique)), "issued" to "2024", "doi" to "10.1000/$unique")))
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString.let(mapper::readTree)
        val id = created.path("id").asText()
        mvc.get("/library/documents?q=$unique&limit=1&offset=0&sort=year") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.total") { value(1) }
            jsonPath("$.limit") { value(1) }
            jsonPath("$.items[0].id") { value(id) }
        }
        mvc.get("/library/documents?q=$unique&limit=1&offset=1") { header("Authorization", EDITOR) }.andExpect {
            jsonPath("$.items.length()") { value(0) }
            jsonPath("$.total") { value(1) }
        }
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Legacy save","expectedRevision":1}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.citationKey") { value(unique) }
            jsonPath("$.revision.bibliography.doi") { value("10.1000/$unique") }
        }
        mvc.get("/library/documents?limit=0") { header("Authorization", EDITOR) }.andExpect { status { isBadRequest() } }
        mvc.post("/documents/$id/archive") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }
        mvc.get("/library/documents?q=$unique") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.total") { value(0) } }
        mvc.get("/library/documents?q=$unique&status=archived") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.total") { value(1) } }
    }

    @Test
    fun publicPinnedMetadataDoesNotRevealPrivateTagsOrRenamedKeys() {
        val created = create()
        val id = created.path("id").asText()
        val originalKey = created.path("citationKey").asText()
        val folder = folder("Private project ${UUID.randomUUID()}")
        mvc.put("/library/documents/$id/tags/${folder.path("tagId").asText()}") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }
        val target = UUID.randomUUID()
        Mockito.`when`(targets.isPublic("constitution", target, null)).thenReturn(true)
        mvc.post("/links/constitution/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"documentId":"$id","revisionId":"${created.path("revision").path("id").asText()}"}"""
        }.andExpect { status { isOk() } }
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Private update","citationKey":"Private${UUID.randomUUID()}","expectedRevision":1}"""
        }.andExpect { status { isOk() } }
        mvc.get("/documents/$id?revision=1").andExpect {
            status { isOk() }
            jsonPath("$.citationKey") { value(originalKey) }
            jsonPath("$.tags.length()") { value(0) }
        }
        mvc.get("/documents/$id?revision=2").andExpect { status { isNotFound() } }
        val result = mapper.readTree(mvc.get("/links/constitution/$target").andExpect { status { isOk() } }.andReturn().response.contentAsString)
        assertEquals(originalKey, result.path(0).path("document").path("citationKey").asText())
        assertTrue(result.path(0).path("document").path("tags").isEmpty)
    }

    @Test
    fun invalidOrConflictingExtraFieldsCannotPoisonFolderExport() {
        fun save(extra: Map<String, String>) = mvc.post("/documents") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(
                mapOf(
                    "title" to "Exportable source",
                    "bibliography" to mapOf("type" to "article", "authors" to listOf(mapOf("family" to "Writer")), "extra" to extra),
                ),
            )
        }
        save(mapOf("Source note" to "Spaces are not a BibTeX field name")).andExpect { status { isBadRequest() } }
        save(mapOf("AUTHOR" to "A competing author field")).andExpect { status { isBadRequest() } }
        save(mapOf("custom" to "One", "CUSTOM" to "Another")).andExpect { status { isBadRequest() } }
        save(mapOf("\$bibtex.raw.Source note" to "Malformed source metadata")).andExpect { status { isBadRequest() } }
        save(mapOf("\$bibtex.raw.author" to "An incomplete source pair")).andExpect { status { isBadRequest() } }
        val valid = mapper.readTree(save(mapOf("CUSTOM_FIELD" to "A valid extension")).andExpect { status { isCreated() } }.andReturn().response.contentAsString)
        val id = valid.path("id").asText()
        // A rejected update must retain the valid current revision and exportable bibliography.
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(mapOf("title" to "Rejected change", "expectedRevision" to 1, "bibliography" to mapOf("extra" to mapOf("URL" to "https://example.org/competing"))))
        }.andExpect { status { isBadRequest() } }
        val folder = folder("Export validation ${UUID.randomUUID()}")
        mvc.put("/library/documents/$id/tags/${folder.path("tagId").asText()}") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }
        val exported = mvc.get("/library/bibtex/export?folderId=${folder.path("id").asText()}") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val entry = BibtexParser().parse(exported).entries.single()
        assertEquals("Writer", entry.fields["author"])
        assertEquals("A valid extension", entry.fields["custom_field"])
        mvc.get("/documents/$id") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.currentRevision") { value(1) } }
    }

    @Test
    fun importedSourceMetadataPreservesAlternativeCanonicalFieldsOnExport() {
        val folder = folder("Imported metadata ${UUID.randomUUID()}")
        val key = "Preserved${UUID.randomUUID()}"
        val bibtex = """@article{$key,title={A source},author={Writer, Jane},date={2024-04-02},year={2024},journal={Journal},booktitle={Collection},note={Source note},url={ftp://example.org/source}}"""
        mvc.post("/library/bibtex/import") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(
                mapOf(
                    "operationId" to UUID.randomUUID().toString(),
                    "folderId" to folder.path("id").asText(),
                    "content" to bibtex,
                    "decisions" to listOf(mapOf("index" to 0, "action" to "create")),
                ),
            )
        }.andExpect { status { isOk() } }
        val exported = mvc.get("/library/bibtex/export?folderId=${folder.path("id").asText()}") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val fields = BibtexParser().parse(exported).entries.single().fields
        assertEquals("2024-04-02", fields["date"])
        assertEquals("2024", fields["year"])
        assertEquals("Journal", fields["journal"])
        assertEquals("Collection", fields["booktitle"])
        assertEquals("Source note", fields["note"])
        assertEquals("ftp://example.org/source", fields["url"])
    }

    private fun create(): JsonNode = mvc.post("/documents") {
        header("Authorization", EDITOR)
        contentType = MediaType.APPLICATION_JSON
        content = """{"title":"Document ${UUID.randomUUID()}"}"""
    }.andExpect { status { isCreated() } }.andReturn().response.contentAsString.let(mapper::readTree)

    private fun folder(name: String): JsonNode = mvc.post("/library/folders") {
        header("Authorization", EDITOR)
        contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsString(mapOf("name" to name))
    }.andExpect { status { isCreated() } }.andReturn().response.contentAsString.let(mapper::readTree)

    companion object {
        private const val EDITOR = "Bearer editor"

        @Container @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

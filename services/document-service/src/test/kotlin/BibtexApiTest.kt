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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.io.ByteArrayInputStream
import java.util.UUID
import java.util.zip.ZipInputStream

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [DocumentServiceApplication::class])
class BibtexApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var jdbc: JdbcTemplate

    @MockitoBean lateinit var identity: IdentityClient

    @MockitoBean lateinit var targets: LinkTargetClient

    private val editor = Actor(UUID.randomUUID(), "bib-editor@example.local", listOf("editor"))
    private val publisher = Actor(UUID.randomUUID(), "bib-publisher@example.local", listOf("publisher"))
    private val reviewer = Actor(UUID.randomUUID(), "bib-reviewer@example.local", listOf("reviewer"))
    private val viewer = Actor(UUID.randomUUID(), "bib-viewer@example.local", listOf("viewer"))

    @BeforeEach
    fun identities() {
        Mockito.reset(identity, targets)
        Mockito.`when`(identity.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identity.authenticate(EDITOR)).thenReturn(editor)
        Mockito.`when`(identity.authenticate(PUBLISHER)).thenReturn(publisher)
        Mockito.`when`(identity.authenticate(REVIEWER)).thenReturn(reviewer)
        Mockito.`when`(identity.authenticate(VIEWER)).thenReturn(viewer)
    }

    @Test
    fun folderImportAndExportUseCompleteMembershipBeyondFirstPage() {
        val folder = folder()
        val prefix = key()
        val content = (0..32).joinToString("\n") { "@article{${prefix}_$it,title={Document $it},author={Smith, Jane},year={2024}}" }
        val request = mapOf(
            "operationId" to UUID.randomUUID().toString(),
            "folderId" to folder["id"].asText(),
            "content" to content,
            "decisions" to (0..32).map { mapOf("index" to it, "action" to "create") },
        )
        val imported = performImport(request)
        assertEquals(33, imported["documents"].size())
        val first = imported["documents"][0]
        assertEquals(folder["tagId"].asText(), first["tags"][0]["id"].asText())
        assertEquals(1, first["currentRevision"].asInt())
        mvc.get("/library/documents?folderId=${folder["id"].asText()}") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(30) }
            jsonPath("$.total") { value(33) }
        }
        mvc.get("/library/documents?q=$prefix") { header("Authorization", EDITOR) }.andExpect { jsonPath("$.total") { value(33) } }
        val exported = mvc.get("/library/bibtex/export?folderId=${folder["id"].asText()}") { header("Authorization", PUBLISHER) }
            .andExpect { status { isOk() } }.andReturn().response
        assertTrue(exported.contentType!!.contains("text/x-bibtex"))
        assertTrue(exported.getHeader("Content-Disposition")!!.contains("attachment"))
        assertEquals((0..32).map { "${prefix}_$it" }.toSet(), BibtexParser().parse(exported.contentAsString).entries.map { it.key }.toSet())
        val other = performImport(mapOf("operationId" to UUID.randomUUID().toString(), "content" to "@misc{${key()},title={Elsewhere}}", "decisions" to listOf(mapOf("index" to 0, "action" to "create"))))
        mvc.get("/library/bibtex/export?folderId=${folder["id"].asText()}&documentIds=${other["documents"][0]["id"].asText()}") { header("Authorization", EDITOR) }
            .andExpect { status { isBadRequest() } }
        Mockito.verifyNoInteractions(targets)
    }

    @Test
    fun retriesReturnOriginalResultAndChangedPayloadIsRejected() {
        val citationKey = key()
        val request = mapOf(
            "operationId" to UUID.randomUUID().toString(),
            "content" to "@misc{$citationKey,title={Original}}",
            "decisions" to listOf(mapOf("index" to 0, "action" to "create")),
        )
        val first = performImport(request)
        val id = first["documents"][0]["id"].asText()
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Later edit","expectedRevision":1}"""
        }.andExpect { status { isOk() } }
        val replay = performImport(request)
        assertEquals(first, replay)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM documents WHERE id = ?::uuid", Int::class.java, id))
        mvc.post("/library/bibtex/import") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(request + ("content" to "@misc{$citationKey,title={Changed}}"))
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun previewSuggestsExplicitConflictResolutionAndFolderLinkPreservesExistingMetadata() {
        val folder = folder()
        val citationKey = key()
        val content = "@article{$citationKey,title={Existing source},doi={10.1000/example},file={/etc/passwd}}"
        val existing = performImport(mapOf("operationId" to UUID.randomUUID().toString(), "content" to content, "decisions" to listOf(mapOf("index" to 0, "action" to "create"))))["documents"][0]
        val preview = mvc.post("/library/bibtex/preview") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            this.content = mapper.writeValueAsString(mapOf("content" to content, "folderId" to folder["id"].asText()))
        }.andExpect {
            status { isOk() }
            jsonPath("$.entries[0].conflictDocumentId") { value(existing["id"].asText()) }
            jsonPath("$.entries[0].duplicateCandidates[0].id") { value(existing["id"].asText()) }
        }.andReturn().response.contentAsString
        assertTrue(preview.contains("Upload attachment"))
        val adopted = performImport(
            mapOf(
                "operationId" to UUID.randomUUID().toString(),
                "folderId" to folder["id"].asText(),
                "content" to content,
                "decisions" to listOf(mapOf("index" to 0, "action" to "link", "documentId" to existing["id"].asText())),
            ),
        )["documents"][0]
        assertEquals(existing["id"], adopted["id"])
        assertEquals(1, adopted["currentRevision"].asInt())
        assertEquals(0, adopted["revision"]["attachments"].size())
        assertEquals(folder["tagId"].asText(), adopted["tags"][0]["id"].asText())
    }

    @Test
    fun collidingEntriesRollbackEntireImportAndExplicitUpdateRequiresExpectedRevision() {
        val citationKey = key()
        val content = "@misc{$citationKey,title={First}}\n@misc{${citationKey.uppercase()},title={Second}}"
        mvc.post("/library/bibtex/import") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            this.content = mapper.writeValueAsString(
                mapOf(
                    "operationId" to UUID.randomUUID().toString(),
                    "content" to content,
                    "decisions" to listOf(mapOf("index" to 0, "action" to "create"), mapOf("index" to 1, "action" to "create")),
                ),
            )
        }.andExpect { status { isConflict() } }
        mvc.get("/library/keys/$citationKey") { header("Authorization", EDITOR) }.andExpect { status { isNotFound() } }
        val existing = performImport(mapOf("operationId" to UUID.randomUUID().toString(), "content" to "@misc{$citationKey,title={Initial}}", "decisions" to listOf(mapOf("index" to 0, "action" to "create"))))["documents"][0]
        val update = mapOf(
            "operationId" to UUID.randomUUID().toString(),
            "content" to "@misc{$citationKey,title={Updated}}",
            "decisions" to listOf(mapOf("index" to 0, "action" to "update", "documentId" to existing["id"].asText(), "expectedRevision" to 1)),
        )
        assertEquals("Updated", performImport(update)["documents"][0]["revision"]["title"].asText())
        mvc.get("/documents/${existing["id"].asText()}?revision=1") { header("Authorization", EDITOR) }
            .andExpect { jsonPath("$.revision.title") { value("Initial") } }
    }

    @Test
    fun permissionsAllowReadOnlyExportButRejectImportsAndAnonymousLibraryAccess() {
        val payload = mapper.writeValueAsString(mapOf("content" to "@misc{Key,title={Example}}"))
        for (authorization in listOf(PUBLISHER, REVIEWER, VIEWER)) {
            mvc.post("/library/bibtex/preview") {
                header("Authorization", authorization)
                contentType = MediaType.APPLICATION_JSON
                content = payload
            }.andExpect { status { isForbidden() } }
            mvc.post("/library/bibtex/import") {
                header("Authorization", authorization)
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("operationId" to "roles", "content" to "@misc{Key,title={Example}}", "decisions" to listOf(mapOf("index" to 0, "action" to "create"))))
            }.andExpect { status { isForbidden() } }
        }
        for (authorization in listOf(PUBLISHER, REVIEWER)) {
            mvc.get("/library/bibtex/export") { header("Authorization", authorization) }.andExpect { status { isOk() } }
        }
        mvc.get("/library/bibtex/export") { header("Authorization", VIEWER) }.andExpect { status { isForbidden() } }
        mvc.get("/library/bibtex/export").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun zipExportsAttachmentsWithRelativeReferencesForLibraryFolderAndSelection() {
        val folder = folder()
        val citationKey = key()
        val content = "@misc{$citationKey,title={Bundled source},file={/Users/private/source.pdf}}\n@misc{${citationKey}Empty,title={No files}}"
        val imported = performImport(
            mapOf(
                "operationId" to UUID.randomUUID().toString(),
                "content" to content,
                "folderId" to folder["id"].asText(),
                "decisions" to listOf(mapOf("index" to 0, "action" to "create"), mapOf("index" to 1, "action" to "create")),
            ),
        )["documents"]
        val id = imported[0]["id"].asText()
        upload(id, 1, "../unsafe;name.txt", "First attachment")
        val uploaded = upload(id, 2, "notes.txt", "Second attachment")
        val firstFileId = uploaded["revision"]["attachments"][0]["id"].asText()
        val secondFileId = uploaded["revision"]["attachments"][1]["id"].asText()
        val firstPath = "files/$id/$firstFileId-unsafe_name.txt"
        val secondPath = "files/$id/$secondFileId-notes.txt"
        for (scope in listOf("", "&folderId=${folder["id"].asText()}", "&folderId=${folder["id"].asText()}&documentIds=$id")) {
            val entries = archive(scope)
            assertEquals("First attachment", entries.getValue(firstPath).toString(Charsets.UTF_8))
            assertEquals("Second attachment", entries.getValue(secondPath).toString(Charsets.UTF_8))
            val bibliography = BibtexParser().parse(entries.getValue("references.bib").toString(Charsets.UTF_8)).entries
            val bundled = bibliography.single { it.key == citationKey }
            val paths = com.constitutionatlas.document.service.BibtexCodec.text(bundled.fields.getValue("file")).split(';')
            assertEquals(listOf(firstPath, secondPath), paths)
            assertTrue(paths.all { it in entries })
            assertTrue(!bundled.fields.getValue("file").contains("/Users/"))
            bibliography.find { it.key == citationKey + "Empty" }?.let { assertTrue("file" !in it.fields) }
            if (scope.contains("documentIds=")) assertEquals(setOf("references.bib", firstPath, secondPath), entries.keys)
        }
        val plain = mvc.get("/library/bibtex/export?folderId=${folder["id"].asText()}") { header("Authorization", PUBLISHER) }
            .andExpect { status { isOk() } }.andReturn().response.contentAsString
        assertTrue(BibtexParser().parse(plain).entries.all { "file" !in it.fields })
        assertTrue(!plain.contains("/Users/"))
    }

    @Test
    fun archivedSelectionCanExportWhileFolderBoundariesAndReaderPermissionsRemainEnforced() {
        val folder = folder()
        val created = performImport(
            mapOf(
                "operationId" to UUID.randomUUID().toString(),
                "content" to "@misc{${key()},title={Archived export}}",
                "decisions" to listOf(mapOf("index" to 0, "action" to "create")),
            ),
        )["documents"][0]
        val id = created["id"].asText()
        mvc.post("/documents/$id/archive") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }
        mvc.get("/library/bibtex/export?documentIds=$id") { header("Authorization", PUBLISHER) }.andExpect {
            status { isOk() }
            content { string(org.hamcrest.Matchers.containsString("Archived export")) }
        }
        assertEquals(setOf("references.bib"), archive("&documentIds=$id").keys)
        mvc.get("/library/bibtex/export?includeFiles=true&folderId=${folder["id"].asText()}&documentIds=$id") { header("Authorization", EDITOR) }
            .andExpect { status { isBadRequest() } }
        mvc.get("/library/bibtex/export?includeFiles=true&documentIds=$id") { header("Authorization", VIEWER) }
            .andExpect { status { isForbidden() } }
        mvc.get("/library/bibtex/export?includeFiles=true&documentIds=$id").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun publicPinnedMetadataDoesNotRevealImportedLocalFilePathsOrCodecFields() {
        val created = performImport(
            mapOf(
                "operationId" to UUID.randomUUID().toString(),
                "content" to "@misc{${key()},title={Public source},file={/Users/private/source.pdf},custom={Visible}}",
                "decisions" to listOf(mapOf("index" to 0, "action" to "create")),
            ),
        )["documents"][0]
        val id = created["id"].asText()
        val target = UUID.randomUUID()
        Mockito.`when`(targets.isPublic("constitution", target, null)).thenReturn(true)
        mvc.post("/links/constitution/$target") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(mapOf("documentId" to id, "revisionId" to created["revision"]["id"].asText()))
        }.andExpect { status { isOk() } }
        val public = mvc.get("/documents/$id").andExpect { status { isOk() } }.andReturn().response.contentAsString
        val extra = mapper.readTree(public)["revision"]["bibliography"]["extra"]
        assertEquals("Visible", extra["custom"].asText())
        assertTrue(!public.contains("/Users/") && !public.contains("$" + "bibtex."))
    }

    private fun archive(scope: String): Map<String, ByteArray> {
        val pending = mvc.get("/library/bibtex/export?includeFiles=true$scope") { header("Authorization", PUBLISHER) }
            .andExpect { request { asyncStarted() } }.andReturn()
        val response = mvc.perform(asyncDispatch(pending)).andExpect(status().isOk).andReturn().response
        assertEquals("application/zip", response.contentType)
        assertTrue(response.getHeader("Content-Disposition")!!.contains(".zip"))
        return ZipInputStream(ByteArrayInputStream(response.contentAsByteArray)).use { zip ->
            buildMap {
                while (true) {
                    val entry = zip.nextEntry ?: break
                    put(entry.name, zip.readAllBytes())
                }
            }
        }
    }

    private fun upload(id: String, expected: Int, name: String, content: String): JsonNode = mapper.readTree(
        mvc.perform(
            multipart("/documents/$id/attachments").file(MockMultipartFile("file", name, "text/plain", content.toByteArray()))
                .param("expectedRevision", expected.toString()).header("Authorization", EDITOR),
        )
            .andExpect(status().isOk).andReturn().response.contentAsString,
    )

    private fun folder(): JsonNode = mapper.readTree(
        mvc.post("/library/folders") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(mapOf("name" to "Folder ${UUID.randomUUID()}"))
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
    )

    private fun performImport(request: Map<String, Any>): JsonNode = mapper.readTree(
        mvc.post("/library/bibtex/import") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(request)
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString,
    )

    private fun key(): String = "bib" + UUID.randomUUID().toString().replace("-", "")

    companion object {
        private const val EDITOR = "Bearer bib-editor"
        private const val PUBLISHER = "Bearer bib-publisher"
        private const val REVIEWER = "Bearer bib-reviewer"
        private const val VIEWER = "Bearer bib-viewer"

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

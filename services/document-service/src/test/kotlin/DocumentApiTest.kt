import com.constitutionatlas.document.DocumentServiceApplication
import com.constitutionatlas.document.service.LinkTargetClient
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
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
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [DocumentServiceApplication::class])
class DocumentApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var jdbc: org.springframework.jdbc.core.JdbcTemplate

    @Autowired lateinit var mapper: ObjectMapper

    @MockitoBean lateinit var identity: IdentityClient

    @MockitoBean lateinit var targets: LinkTargetClient

    private val editor = Actor(UUID.randomUUID(), "editor@example.local", listOf("editor"))
    private val viewer = Actor(UUID.randomUUID(), "viewer@example.local", listOf("viewer"))
    private val admin = Actor(UUID.randomUUID(), "admin@example.local", listOf("admin"))

    @BeforeEach
    fun identity() {
        Mockito.reset(identity, targets)
        Mockito.`when`(identity.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identity.authenticate(EDITOR)).thenReturn(editor)
        Mockito.`when`(identity.authenticate(VIEWER)).thenReturn(viewer)
        Mockito.`when`(identity.authenticate(ADMIN)).thenReturn(admin)
    }

    @Test
    fun editorUploadCreatesOnePinnedRecordAndReplaysWithoutDuplicates() {
        val target = UUID.randomUUID()
        val operation = UUID.randomUUID()
        val title = "Editor evidence $operation"
        val metadata = """{"operationId":"$operation","title":"$title","sourceUrl":"https://example.org/law"}"""
        fun upload(body: String = metadata) = mvc.perform(
            multipart("/links/constitution/$target/documents")
                .file(MockMultipartFile("metadata", "metadata.json", "application/json", body.toByteArray()))
                .file(MockMultipartFile("file", "law.txt", "text/plain", "Original law text".toByteArray()))
                .header("Authorization", EDITOR),
        )
        val first = mapper.readTree(upload().andExpect(status().isCreated).andReturn().response.contentAsString)
        val id = first.path("id").asText()
        val revision = first.path("revision").path("revision").asInt()
        val pin = first.path("revision").path("id").asText()
        upload().andExpect(status().isCreated).andExpect(jsonPath("$.id").value(id))
        upload(metadata.replace(title, "Changed evidence")).andExpect(status().isConflict)
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM documents WHERE id = ?::uuid", Int::class.java, id))
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM document_link_events WHERE document_id = ?::uuid", Int::class.java, id))
        mvc.get("/links/constitution/$target") { header("Authorization", EDITOR) }.andExpect {
            status { isOk() }
            jsonPath("$[0].revisionId") { value(pin) }
        }
        val file = mvc.get("/documents/$id/revisions/$revision/file") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }.andReturn().response
        org.junit.jupiter.api.Assertions.assertArrayEquals("Original law text".toByteArray(), file.contentAsByteArray)
        mvc.get("/documents/$id").andExpect { status { isNotFound() } }
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Later revision","expectedRevision":$revision}"""
        }.andExpect { status { isOk() } }
        upload().andExpect(jsonPath("$.revision.id").value(pin))
    }

    @Test
    fun editorUploadRejectsInvalidFilesScopesAndRolesWithoutPartialRecords() {
        val target = UUID.randomUUID()
        val title = "Rejected editor upload ${UUID.randomUUID()}"
        fun upload(type: String, authorization: String?, fileType: String? = null) = mvc.perform(
            multipart("/links/$type/$target/documents")
                .file(MockMultipartFile("metadata", "metadata.json", "application/json", """{"operationId":"${UUID.randomUUID()}","title":"$title","sourceUrl":"https://example.org/source"}""".toByteArray()))
                .apply { if (fileType != null) file(MockMultipartFile("file", "invalid.svg", fileType, "invalid".toByteArray())) }
                .apply { if (authorization != null) header("Authorization", authorization) },
        )
        upload("constitution", null).andExpect(status().isUnauthorized)
        upload("constitution", VIEWER).andExpect(status().isForbidden)
        upload("amendment", EDITOR).andExpect(status().isBadRequest)
        upload("constitution", EDITOR, "image/svg+xml").andExpect(status().isBadRequest)
        org.junit.jupiter.api.Assertions.assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM document_revisions WHERE title = ?", Int::class.java, title))
        org.junit.jupiter.api.Assertions.assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM document_link_events WHERE target_id = ?", Int::class.java, target))
        upload("constitution", EDITOR).andExpect(status().isCreated)
    }

    @Test
    fun concurrentEditorUploadRetriesCreateOnlyOneLibraryRecord() {
        val target = UUID.randomUUID()
        val operation = UUID.randomUUID()
        val body = """{"operationId":"$operation","title":"Concurrent law $operation","sourceUrl":"https://example.org/source"}"""
        val pool = java.util.concurrent.Executors.newFixedThreadPool(2)
        try {
            val tasks = (1..2).map {
                pool.submit<String> {
                    val result = mvc.perform(
                        multipart("/links/constitution/$target/documents")
                            .file(MockMultipartFile("metadata", "metadata.json", "application/json", body.toByteArray()))
                            .header("Authorization", EDITOR),
                    ).andExpect(status().isCreated).andReturn()
                    mapper.readTree(result.response.contentAsString).path("id").asText()
                }
            }
            org.junit.jupiter.api.Assertions.assertEquals(tasks[0].get(), tasks[1].get())
            org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM document_link_events WHERE target_id = ?", Int::class.java, target))
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun migrationCapturesAreIdempotentPinnedPrivateAndDownloadOriginalBytes() {
        val bytes = "<html><script>doNotExecute()</script>ä</html>".toByteArray()
        val hash = java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        val request = mapper.writeValueAsString(mapOf("attemptId" to UUID.randomUUID(), "title" to "Archive", "sourceUrl" to "https://example.org/original.htm", "fileName" to "original.htm", "fileBase64" to java.util.Base64.getEncoder().encodeToString(bytes), "fileSha256" to hash))
        fun capture() = mvc.post("/migration-captures") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = request
        }
        val first = mapper.readTree(capture().andExpect { status { isCreated() } }.andReturn().response.contentAsString)
        val id = first.path("id").asText()
        val revision = first.path("revision").path("revision").asInt()
        val file = mvc.get("/documents/$id/revisions/$revision/file") { header("Authorization", EDITOR) }.andExpect { status { isOk() } }.andReturn().response
        org.junit.jupiter.api.Assertions.assertArrayEquals(bytes, file.contentAsByteArray)
        org.junit.jupiter.api.Assertions.assertTrue(file.getHeader("Content-Disposition")!!.startsWith("attachment"))
        mvc.get("/documents/$id/revisions/$revision/file").andExpect { status { isNotFound() } }
        mvc.put("/documents/$id") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Later metadata","expectedRevision":$revision}"""
        }.andExpect { status { isOk() } }
        capture().andExpect {
            status { isCreated() }
            jsonPath("$.id") { value(id) }
            jsonPath("$.revision.revision") { value(revision) }
        }
        mvc.post("/migration-captures") {
            header("Authorization", EDITOR)
            contentType = MediaType.APPLICATION_JSON
            content = request.replace("Archive", "Changed")
        }.andExpect { status { isConflict() } }
        mvc.post("/migration-captures") {
            header("Authorization", VIEWER)
            contentType = MediaType.APPLICATION_JSON
            content = request
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun legalPagesKeepDraftPrivateAndRequireAdminForPublication() {
        val key = "impressum"
        mvc.get("/legal-pages/$key").andExpect { status { isNotFound() } }
        mvc.put("/legal-pages/imprint-details/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":0,"name":"Atlas Foundation","streetAddress":"Main Street 1","postalCode":"10000","city":"Berlin","country":"Germany","email":"contact@atlas.example"}"""
        }.andExpect { status { isOk() } }
        mvc.post("/legal-pages/imprint-details/publish") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":1}"""
        }.andExpect { status { isOk() } }
        mvc.get("/legal-pages/imprint-details").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Atlas Foundation") }
            jsonPath("$.email") { value("contact@atlas.example") }
        }
        mvc.get("/legal-pages/$key/editor").andExpect { status { isUnauthorized() } }
        mvc.get("/legal-pages/$key/editor") { header("Authorization", VIEWER) }.andExpect { status { isForbidden() } }
        mvc.put("/legal-pages/$key/draft") {
            header("Authorization", VIEWER)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"Operator and contact","expectedRevision":0}"""
        }.andExpect { status { isForbidden() } }
        mvc.put("/legal-pages/$key/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"Operator and contact","expectedRevision":0}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.draft.revision") { value(1) }
            jsonPath("$.published") { doesNotExist() }
        }
        mvc.get("/legal-pages/$key").andExpect { status { isNotFound() } }
        mvc.post("/legal-pages/$key/publish") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":1}"""
        }.andExpect { status { isOk() } }
        mvc.get("/legal-pages/$key").andExpect {
            status { isOk() }
            jsonPath("$.content") { value("Operator and contact") }
            jsonPath("$.separateContact") { value(true) }
        }
        mvc.put("/legal-pages/$key/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"Updated private draft","expectedRevision":1}"""
        }.andExpect { status { isOk() } }
        mvc.get("/legal-pages/$key").andExpect { jsonPath("$.content") { value("Operator and contact") } }
        mvc.get("/legal-pages/$key/editor/revisions") { header("Authorization", ADMIN) }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
        }
        mvc.post("/legal-pages/$key/publish") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":1}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun exampleLegalDetailsCannotBePublished() {
        mvc.put("/legal-pages/datenschutz/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"BEISPIEL — VOR VERÖFFENTLICHUNG ERSETZEN","expectedRevision":0}"""
        }.andExpect { status { isOk() } }
        mvc.post("/legal-pages/datenschutz/publish") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":1}"""
        }.andExpect { status { isBadRequest() } }
        mvc.get("/legal-pages/datenschutz").andExpect { status { isNotFound() } }
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
    fun wikiPictureFormatsValidateRealFilesAndRejectMismatches() {
        val formats = listOf(
            "sample.jpg" to "image/jpeg",
            "sample.png" to "image/png",
            "sample.gif" to "image/gif",
            "sample.webp" to "image/webp",
            "sample.avif" to "image/avif",
        )
        formats.forEach { (name, contentType) ->
            val (id, _) = create()
            val bytes = javaClass.getResourceAsStream("/wiki-images/$name")!!.use { it.readBytes() }
            mvc.perform(
                multipart("/documents/$id/file")
                    .file(MockMultipartFile("file", name, contentType, bytes))
                    .param("expectedRevision", "1")
                    .header("Authorization", EDITOR),
            ).andExpect(status().isOk)
        }

        val (mismatchedId, _) = create()
        val png = javaClass.getResourceAsStream("/wiki-images/sample.png")!!.use { it.readBytes() }
        mvc.perform(
            multipart("/documents/$mismatchedId/file")
                .file(MockMultipartFile("file", "fake.jpg", "image/jpeg", png))
                .param("expectedRevision", "1")
                .header("Authorization", EDITOR),
        ).andExpect(status().isBadRequest)
        mvc.perform(
            multipart("/documents/$mismatchedId/file")
                .file(MockMultipartFile("file", "unsafe.svg", "image/svg+xml", "<svg/>".toByteArray()))
                .param("expectedRevision", "1")
                .header("Authorization", EDITOR),
        ).andExpect(status().isBadRequest)
        mvc.perform(
            multipart("/documents/$mismatchedId/file")
                .file(MockMultipartFile("file", "broken.png", "image/png", png.copyOfRange(0, 16)))
                .param("expectedRevision", "1")
                .header("Authorization", EDITOR),
        ).andExpect(status().isBadRequest)
    }

    @Test
    fun wikiImageStaysPrivateUntilItsRevisionIsPublished() {
        for (targetType in listOf("country_wiki", "constitution_wiki", "jurisdiction_wiki")) {
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
            mvc.post("/links/$targetType/$target") {
                header("Authorization", EDITOR)
                contentType = MediaType.APPLICATION_JSON
                content = """{"documentId":"$id","revisionId":"$pinnedId","scopeRevisionId":"$scope"}"""
            }.andExpect { status { isOk() } }
            mvc.get("/documents/$id/revisions/2/file").andExpect { status { isNotFound() } }
            Mockito.`when`(targets.isPublic("$targetType", target, scope)).thenReturn(true)
            Mockito.`when`(targets.isWikiImagePublic("$targetType", target, scope, UUID.fromString(id), 2)).thenReturn(true)
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

    @Test
    fun materialWritesEnforceTheEntityRoleAndKeepPublicRevisionPins() {
        val publisherToken = "Bearer material-publisher"
        val reviewerToken = "Bearer material-reviewer"
        Mockito.`when`(identity.authenticate(publisherToken)).thenReturn(Actor(UUID.randomUUID(), "publisher@example.test", listOf("publisher")))
        Mockito.`when`(identity.authenticate(reviewerToken)).thenReturn(Actor(UUID.randomUUID(), "reviewer@example.test", listOf("reviewer")))
        for (type in listOf("amendment_material", "change_material", "lifecycle_material")) {
            val target = UUID.randomUUID()
            val scope = if (type == "amendment_material") null else UUID.randomUUID()
            val scopeJson = scope?.let { "\"$it\"" } ?: "null"
            val (document, pin) = create()
            Mockito.`when`(targets.isPublic(type, target, scope)).thenReturn(true)
            val path = "/links/$type/$target"
            val body = """{"documentId":"$document","revisionId":"$pin","scopeRevisionId":$scopeJson}"""
            val allowed = if (type == "lifecycle_material") publisherToken else EDITOR
            val denied = if (type == "lifecycle_material") EDITOR else publisherToken
            for (token in listOf(VIEWER, reviewerToken, denied)) {
                mvc.post(path) { header("Authorization", token); contentType = MediaType.APPLICATION_JSON; content = body }.andExpect { status { isForbidden() } }
            }
            mvc.post(path) { contentType = MediaType.APPLICATION_JSON; content = body }.andExpect { status { isUnauthorized() } }
            mvc.post(path) { header("Authorization", allowed); contentType = MediaType.APPLICATION_JSON; content = body }.andExpect { status { isOk() } }
            val scopeQuery = scope?.let { "?scopeRevisionId=$it" } ?: ""
            mvc.get(path + scopeQuery).andExpect { status { isOk() }; jsonPath("$[0].revisionId") { value(pin) } }
            val edit = """{"title":"Updated scoped note","description":"Background for this exact change","expectedRevision":1,"expectedLinkedRevisionId":"$pin","scopeRevisionId":$scopeJson}"""
            mvc.put("$path/$document/material") { header("Authorization", allowed); contentType = MediaType.APPLICATION_JSON; content = edit }.andExpect { status { isOk() }; jsonPath("$[0].document.revision.description") { value("Background for this exact change") } }
            mvc.put("$path/$document/material") { header("Authorization", allowed); contentType = MediaType.APPLICATION_JSON; content = edit }.andExpect { status { isConflict() } }
            mvc.get("/documents/$document?revision=1") { header("Authorization", EDITOR) }.andExpect { status { isOk() }; jsonPath("$.revision.id") { value(pin) } }
            mvc.delete("$path/$document$scopeQuery") { header("Authorization", allowed) }.andExpect { status { isOk() } }
            mvc.get(path + scopeQuery).andExpect { status { isOk() }; jsonPath("$.length()") { value(0) } }
            Mockito.`when`(targets.isPublic(type, target, scope)).thenReturn(false)
            mvc.get(path + scopeQuery).andExpect { status { isNotFound() } }
        }
    }

    @Test
    fun sharedMaterialsCanBeRevisedIndependentlyWithoutChangingAnotherScopePin() {
        val target = UUID.randomUUID()
        val scopes = listOf(UUID.randomUUID(), UUID.randomUUID())
        val (document, pin) = create()
        for (scope in scopes) {
            Mockito.`when`(targets.isPublic("change_material", target, scope)).thenReturn(true)
            mvc.post("/links/change_material/$target") {
                header("Authorization", EDITOR); contentType = MediaType.APPLICATION_JSON
                content = """{"documentId":"$document","revisionId":"$pin","scopeRevisionId":"$scope"}"""
            }.andExpect { status { isOk() } }
        }
        for ((index, scope) in scopes.withIndex()) {
            mvc.put("/links/change_material/$target/$document/material") {
                header("Authorization", EDITOR); contentType = MediaType.APPLICATION_JSON
                content = """{"title":"Scope ${index + 1}","description":"Independent context","expectedRevision":1,"expectedLinkedRevisionId":"$pin","scopeRevisionId":"$scope"}"""
            }.andExpect { status { isOk() }; jsonPath("$[0].document.revision.title") { value("Scope ${index + 1}") } }
        }
        for ((index, scope) in scopes.withIndex()) {
            mvc.get("/links/change_material/$target?scopeRevisionId=$scope").andExpect {
                status { isOk() }; jsonPath("$[0].document.revision.title") { value("Scope ${index + 1}") }; jsonPath("$[0].document.revision.revision") { value(index + 2) }
            }
        }
    }

    @Test
    fun commentaryOnlyCreationIsAtomicAndAcceptsNoFileOrSourceUrl() {
        val target = UUID.randomUUID()
        Mockito.`when`(targets.isPublic("amendment_material", target, null)).thenReturn(true)
        val metadata = MockMultipartFile("metadata", "metadata.json", "application/json", """{"operationId":"${UUID.randomUUID()}","title":"Commentary","description":"An amendment-specific explanation."}""".toByteArray())
        mvc.perform(multipart("/links/amendment_material/$target/documents").file(metadata).header("Authorization", EDITOR)).andExpect(status().isCreated).andExpect(jsonPath("$.revision.description").value("An amendment-specific explanation."))
        mvc.get("/links/amendment_material/$target").andExpect { status { isOk() }; jsonPath("$.length()") { value(1) } }
    }

    companion object {
        private const val EDITOR = "Bearer editor"
        private const val VIEWER = "Bearer viewer"
        private const val ADMIN = "Bearer admin"

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

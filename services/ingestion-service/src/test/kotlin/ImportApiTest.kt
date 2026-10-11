import com.constitutionatlas.ingestion.IngestionServiceApplication
import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.client.DownstreamConstitution
import com.constitutionatlas.ingestion.client.DownstreamCountry
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.ingestion.service.ImportService
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.UnauthorizedException
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.security.MessageDigest
import java.time.LocalDate
import java.util.Base64
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [IngestionServiceApplication::class])
class ImportApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var jdbc: JdbcTemplate

    @Autowired
    lateinit var importService: ImportService

    @MockBean
    lateinit var catalogClient: CatalogClient

    @MockBean
    lateinit var contentClient: ContentClient

    @MockBean
    lateinit var identityClient: IdentityClient

    private val admin =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000413"), "local-admin@example.local", listOf("admin"))
    private val reviewer = Actor(UUID.randomUUID(), "reviewer@example.local", listOf("reviewer"))
    private val publisher = Actor(UUID.randomUUID(), "publisher@example.local", listOf("publisher"), stepUpFresh = true)
    private val otherEditor = Actor(UUID.randomUUID(), "other-editor@example.local", listOf("editor"))
    private val scopedImporter = Actor(UUID.randomUUID(), "mcp@example.local", emptyList(), listOf("ingestion:import"))
    private val json = ObjectMapper()

    @BeforeEach
    fun stubIdentity() {
        Mockito.reset(identityClient)
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(admin)
        Mockito.`when`(identityClient.authenticate(REVIEWER_TOKEN)).thenReturn(reviewer)
        Mockito.`when`(identityClient.authenticate(PUBLISHER_TOKEN)).thenReturn(publisher)
        Mockito.`when`(identityClient.authenticate(EDITOR_TOKEN)).thenReturn(otherEditor)
        Mockito.`when`(identityClient.authenticate(MCP_TOKEN)).thenReturn(scopedImporter)
    }

    private fun jobId(response: String): String = json.readTree(response).path("id").asText()

    private fun prepare(id: String) = mockMvc.post("/import-jobs/$id/prepare") { header("Authorization", TOKEN) }
        .andExpect {
            status { isOk() }
            jsonPath("$.status") { value("pending_review") }
        }

    private fun confirmOutline(id: String) = mockMvc.post("/import-jobs/$id/confirm-outline") { header("Authorization", TOKEN) }
        .andExpect {
            status { isOk() }
            jsonPath("$.outlineConfirmedBy") { value(admin.id.toString()) }
        }

    private fun approve(id: String) = mockMvc.post("/import-jobs/$id/approve") {
        header("Authorization", REVIEWER_TOKEN)
        contentType = MediaType.APPLICATION_JSON
        content = """{"reason":"Reviewed source and structure against the submitted text."}"""
    }
        .andExpect {
            status { isOk() }
            jsonPath("$.status") { value("approved") }
        }

    private fun publish(id: String) = mockMvc.post("/import-jobs/$id/publish") { header("Authorization", PUBLISHER_TOKEN) }
        .andExpect {
            status { isOk() }
            jsonPath("$.status") { value("completed") }
        }

    private fun anyUuid(): UUID = Mockito.any(UUID::class.java) ?: UUID(0, 0)
    private fun anyStr(): String = Mockito.anyString() ?: ""

    @Test
    fun chunkedImportResumesAndCompletesAsPendingReview() {
        val batch = json.readTree(
            mockMvc.post("/import-batches") { header("Authorization", MCP_TOKEN) }
                .andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        ).path("id").asText()
        val payload = """{"isoCode":"FR","countryName":"France","constitutionSlug":"1958","constitutionTitle":"Constitution","versionLabel":"1","sourceUrl":"https://example.org/test-import","constitutionId":"${UUID.randomUUID()}","settingsRevisionId":"$SETTINGS_REVISION","articles":[{"articleNumber":"1","title":"A","sortOrder":1}]}"""
        val bytes = payload.toByteArray()
        val checksum = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        val beginBody = """{"idempotencyKey":"chunked-item","checksumSha256":"$checksum","totalBytes":${bytes.size}}"""
        val first = mockMvc.post("/import-batches/$batch/uploads") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = beginBody
        }.andExpect {
            status { isCreated() }
            jsonPath("$.missingChunks[0]") { value(0) }
        }.andReturn()
        val uploadId = jobId(first.response.contentAsString)
        mockMvc.post("/import-batches/$batch/uploads") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = beginBody
        }.andExpect {
            status { isCreated() }
            jsonPath("$.id") { value(uploadId) }
        }
        mockMvc.get("/import-uploads/$uploadId") { header("Authorization", EDITOR_TOKEN) }
            .andExpect { status { isForbidden() } }
        val chunkBody = """{"dataBase64":"${Base64.getEncoder().encodeToString(bytes)}","checksumSha256":"$checksum"}"""
        mockMvc.put("/import-uploads/$uploadId/chunks/0") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = chunkBody
        }.andExpect {
            status { isOk() }
            jsonPath("$.missingChunks.length()") { value(0) }
        }
        mockMvc.put("/import-uploads/$uploadId/chunks/0") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = chunkBody
        }.andExpect { status { isOk() } }
        val completed = mockMvc.post("/import-uploads/$uploadId/complete") { header("Authorization", MCP_TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("completed") }
            }.andReturn()
        val itemId = json.readTree(completed.response.contentAsString).path("itemId").asText()
        mockMvc.get("/import-jobs/$itemId") { header("Authorization", MCP_TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("pending_review") }
            }
        mockMvc.post("/import-uploads/$uploadId/complete") { header("Authorization", MCP_TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.itemId") { value(itemId) }
            }
        Mockito.verifyNoInteractions(catalogClient, contentClient)
        mockMvc.delete("/import-uploads/$uploadId") { header("Authorization", MCP_TOKEN) }
            .andExpect { status { isConflict() } }
    }

    @Test
    fun unfinishedUploadCanBeCanceledOnlyByItsOwner() {
        val batch = json.readTree(
            mockMvc.post("/import-batches") { header("Authorization", MCP_TOKEN) }
                .andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        ).path("id").asText()
        val body = """{"idempotencyKey":"cancel-item","checksumSha256":"${"0".repeat(64)}","totalBytes":8}"""
        val uploadId = jobId(
            mockMvc.post("/import-batches/$batch/uploads") {
                header("Authorization", MCP_TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )
        mockMvc.delete("/import-uploads/$uploadId") { header("Authorization", EDITOR_TOKEN) }
            .andExpect { status { isForbidden() } }
        mockMvc.delete("/import-uploads/$uploadId") { header("Authorization", MCP_TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("canceled") }
                jsonPath("$.missingChunks.length()") { value(0) }
            }
        mockMvc.delete("/import-uploads/$uploadId") { header("Authorization", MCP_TOKEN) }
            .andExpect { status { isOk() } }
        mockMvc.post("/import-uploads/$uploadId/complete") { header("Authorization", MCP_TOKEN) }
            .andExpect { status { isConflict() } }
        mockMvc.post("/import-batches/$batch/uploads") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("canceled") }
        }
    }

    @Test
    fun setupProposalIsPrivateUntilAnEditorConfirmsItsOutline() {
        val constitutionId = UUID.randomUUID()
        val body = """{"isoCode":"FR","countryName":"France","constitutionSlug":"new-constitution","constitutionTitle":"New constitution","languageCode":"fr","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"sampleRoots":[{"kind":"article","label":"1","title":"Opening","content":[{"type":"text","text":"Sample text"}]}]}"""
        Mockito.`when`(catalogClient.createConstitution("FR", "new-constitution", "New constitution"))
            .thenReturn(DownstreamConstitution(constitutionId, "new-constitution", "New constitution"))
        Mockito.`when`(catalogClient.currentSettingsRevisionId(constitutionId)).thenReturn(SETTINGS_REVISION)
        val response = mockMvc.post("/import-setup-proposals") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("proposed") }
        }.andReturn()
        val id = jobId(response.response.contentAsString)
        mockMvc.get("/import-setup-proposals/$id") { header("Authorization", EDITOR_TOKEN) }
            .andExpect { status { isForbidden() } }
        mockMvc.post("/import-setup-proposals/$id/confirm") { header("Authorization", EDITOR_TOKEN) }
            .andExpect { status { isForbidden() } }
        mockMvc.post("/import-setup-proposals/$id/confirm") { header("Authorization", TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("confirmed") }
                jsonPath("$.constitutionId") { value(constitutionId.toString()) }
                jsonPath("$.settingsRevisionId") { value(SETTINGS_REVISION.toString()) }
            }
        mockMvc.post("/import-setup-proposals/$id/confirm") { header("Authorization", TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("confirmed") }
            }
        Mockito.verify(catalogClient, Mockito.times(1)).createConstitution("FR", "new-constitution", "New constitution")
    }

    @Test
    fun scopedImportRequiresConfirmedConstitutionAndSettingsPin() {
        val base = """{"isoCode":"FR","countryName":"France","constitutionSlug":"1958","constitutionTitle":"Constitution","versionLabel":"1","sourceUrl":"https://example.org/test-import","articles":[{"articleNumber":"1","title":"A","sortOrder":1}]}"""
        mockMvc.post("/import-jobs") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = base
        }.andExpect { status { isConflict() } }
        mockMvc.post("/import-jobs") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = base.dropLast(1) + ",\"constitutionId\":\"${UUID.randomUUID()}\",\"settingsRevisionId\":\"$SETTINGS_REVISION\"}"
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("pending_review") }
        }
        Mockito.verifyNoInteractions(catalogClient, contentClient)
    }

    @Test
    fun roleBoundaryRejectsEditingReviewAndPublicationForWrongActors() {
        val id = UUID.randomUUID()
        for (token in listOf(MCP_TOKEN, REVIEWER_TOKEN, PUBLISHER_TOKEN)) {
            mockMvc.post("/import-jobs/$id/prepare") { header("Authorization", token) }
                .andExpect { status { isForbidden() } }
            mockMvc.post("/import-jobs/$id/confirm-outline") { header("Authorization", token) }
                .andExpect { status { isForbidden() } }
        }
        for (token in listOf(MCP_TOKEN, EDITOR_TOKEN, PUBLISHER_TOKEN)) {
            mockMvc.post("/import-jobs/$id/approve") {
                header("Authorization", token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"reason":"Checked the complete source against the draft."}"""
            }.andExpect { status { isForbidden() } }
            mockMvc.post("/import-jobs/$id/reject") {
                header("Authorization", token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"reason":"The submitted source cannot be verified."}"""
            }.andExpect { status { isForbidden() } }
        }
        for (token in listOf(MCP_TOKEN, EDITOR_TOKEN, REVIEWER_TOKEN)) {
            mockMvc.post("/import-jobs/$id/publish") { header("Authorization", token) }
                .andExpect { status { isForbidden() } }
        }
    }

    private fun stubDraft(versionId: UUID, constitutionId: UUID) {
        Mockito.`when`(
            catalogClient.createDraftVersion(
                anyUuid(), anyStr(), Mockito.nullable(LocalDate::class.java), anyStr(),
                Mockito.nullable(String::class.java), Mockito.nullable(String::class.java),
                Mockito.nullable(UUID::class.java), Mockito.nullable(String::class.java), anyUuid(), Mockito.nullable(UUID::class.java),
            ),
        ).thenReturn(DownstreamVersion(versionId, constitutionId, "draft"))
    }

    private fun <T : Any> eqNonNull(value: T): T = Mockito.eq(value) ?: value

    @Test
    fun invalidNumberingFailsWithoutCatalogWrites() {
        mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "isoCode": "FR",
                  "countryName": "France",
                  "constitutionSlug": "1958",
                  "constitutionTitle": "Constitution of 1958",
                  "versionLabel": "1958",
                  "sourceUrl": "https://example.org/test-import",
                  "outline": {"kinds": [{"kindCode": "article", "displayLabel": "Article"}]},
                  "articles": [
                    {"articleNumber": "1", "title": "A", "body": "a", "sortOrder": 1},
                    {"articleNumber": "1", "title": "B", "body": "b", "sortOrder": 2}
                  ]
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("failed") }
            jsonPath("$.errors[0].code") { value("DUPLICATE_NUMBER") }
        }
        Mockito.verifyNoInteractions(catalogClient)
        Mockito.verifyNoInteractions(contentClient)
    }

    @Test
    fun batchItemsAreIndependentAndIdempotent() {
        val batch = json.readTree(
            mockMvc.post("/import-batches") { header("Authorization", TOKEN) }
                .andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        ).path("id").asText()
        val valid = """{"idempotencyKey":"first-item","payload":{"isoCode":"FR","countryName":"France","constitutionSlug":"batch","constitutionTitle":"Constitution","versionLabel":"1","sourceUrl":"https://example.org/test-import","articles":[{"articleNumber":"1","title":"First","sortOrder":1}]}}"""
        val first = json.readTree(
            mockMvc.post("/import-batches/$batch/items") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = valid
            }.andExpect {
                status { isCreated() }
                jsonPath("$.status") { value("pending_review") }
            }.andReturn().response.contentAsString,
        ).path("id").asText()
        mockMvc.post("/import-batches/$batch/items") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = valid
        }.andExpect {
            status { isCreated() }
            jsonPath("$.id") { value(first) }
        }
        mockMvc.post("/import-batches/$batch/items") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = valid.replace("\"versionLabel\":\"1\"", "\"versionLabel\":\"2\"")
        }.andExpect { status { isConflict() } }
        mockMvc.post("/import-batches/$batch/items") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"idempotencyKey":"second-item","payload":{"isoCode":"FR","countryName":"France","constitutionSlug":"batch","constitutionTitle":"Constitution","versionLabel":"2","sourceUrl":"https://example.org/test-import","articles":[{"articleNumber":"1","title":"First","sortOrder":1},{"articleNumber":"1","title":"Duplicate","sortOrder":2}]}}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("failed") }
        }
        mockMvc.get("/import-batches/$batch") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(2) }
            jsonPath("$.items[0].status") { value("pending_review") }
            jsonPath("$.items[1].status") { value("failed") }
        }
        Mockito.verifyNoInteractions(catalogClient, contentClient)
    }

    @Test
    fun validImportRequiresPreparationReviewAndPublication() {
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000501")
        val versionId = UUID.fromString("01900000-0000-4000-8000-000000000502")
        stubCatalog("FR", "France", "1958", "Constitution of 1958", "1958", constitutionId, versionId)
        Mockito.`when`(contentClient.snapshot(versionId)).thenReturn(OrderedSnapshot(versionId, 1, null, emptyList()))

        val staged = mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "isoCode": "FR",
                  "countryName": "France",
                  "constitutionSlug": "1958",
                  "constitutionTitle": "Constitution of 1958",
                  "versionLabel": "1958",
                  "sourceUrl": "https://example.org/test-import",
                  "outline": {"kinds": [{"kindCode": "article", "displayLabel": "Article"}]},
                  "articles": [
                    {"articleNumber": "1", "title": "Sovereignty", "body": "France is a republic.", "sortOrder": 1}
                  ]
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("pending_review") }
            jsonPath("$.isoCode") { value("FR") }
        }.andReturn()
        Mockito.verifyNoInteractions(catalogClient, contentClient)
        val id = jobId(staged.response.contentAsString)
        confirmOutline(id)
        prepare(id).andExpect { jsonPath("$.versionId") { value(versionId.toString()) } }
        Mockito.verify(catalogClient, Mockito.never()).publishVersion(anyUuid(), anyUuid())
        mockMvc.post("/import-jobs/$id/approve") {
            header("Authorization", REVIEWER_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"reason":"Too short"}"""
        }.andExpect { status { isBadRequest() } }
        approve(id)
        mockMvc.get("/import-jobs/$id/decisions") { header("Authorization", REVIEWER_TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].decision") { value("approved") }
                jsonPath("$[0].reason") { value("Reviewed source and structure against the submitted text.") }
                jsonPath("$.length()") { value(1) }
            }
        publish(id)
        assertEquals(
            setOf("audit_publish", "search_reindex"),
            jdbc.queryForList(
                "SELECT event_type FROM import_publication_outbox WHERE import_job_id = ?",
                String::class.java,
                UUID.fromString(id),
            ).toSet(),
        )
        Mockito.verify(catalogClient).publishVersion(versionId, UUID.fromString(id))
        Mockito.verify(catalogClient).replaceOutline(anyUuid(), Mockito.anyList())
    }

    @Test
    fun publishedCatalogVersionIsReconciledAfterInterruptedCompletion() {
        val constitutionId = UUID.randomUUID()
        val versionId = UUID.randomUUID()
        stubCatalog("FR", "France", "1958", "Constitution of 1958", "1958", constitutionId, versionId)
        Mockito.`when`(contentClient.snapshot(versionId)).thenReturn(OrderedSnapshot(versionId, 1, null, emptyList()))
        val staged = mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"FR","countryName":"France","constitutionSlug":"1958","constitutionTitle":"Constitution of 1958","versionLabel":"1958","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"articles":[{"articleNumber":"1","title":"Sovereignty","body":"France is a republic.","sortOrder":1}]}"""
        }.andExpect { status { isCreated() } }.andReturn()
        val id = jobId(staged.response.contentAsString)
        confirmOutline(id)
        prepare(id)
        approve(id)
        jdbc.update("UPDATE import_jobs SET status = 'publishing', published_by = ?, updated_at = NOW() - INTERVAL '3 minutes' WHERE id = ?", publisher.id, UUID.fromString(id))
        Mockito.`when`(catalogClient.version(versionId)).thenAnswer {
            assertEquals("Bearer test-publish-token", DownstreamAuth.header())
            DownstreamVersion(versionId, constitutionId, "published")
        }

        importService.reconcilePublications()

        mockMvc.get("/import-jobs/$id") { header("Authorization", TOKEN) }
            .andExpect { jsonPath("$.status") { value("completed") } }
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM import_publication_outbox WHERE import_job_id = ?", Int::class.java, UUID.fromString(id)))
    }

    @Test
    fun scopedImportReadsPinnedOutlineWithItsOwnCredential() {
        val constitutionId = UUID.randomUUID()
        val revisionId = UUID.randomUUID()
        Mockito.`when`(catalogClient.settingsOutline(constitutionId, revisionId)).thenAnswer {
            assertEquals(MCP_TOKEN, DownstreamAuth.header())
            ImportOutline(listOf(ImportOutlineKind("article", "Article")))
        }
        mockMvc.post("/import-jobs") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"FR","countryName":"France","constitutionSlug":"new","constitutionTitle":"New constitution","constitutionId":"$constitutionId","settingsRevisionId":"$revisionId","versionLabel":"1","sourceUrl":"https://example.org/source","roots":[{"kind":"article","label":"1","content":[{"type":"text","text":"First article."}]}]}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("pending_review") }
        }
    }

    @Test
    fun failedPrivateOutlineLookupCannotLeaveAnUnvalidatedIdempotentJob() {
        val constitutionId = UUID.randomUUID()
        val revisionId = UUID.randomUUID()
        Mockito.`when`(catalogClient.settingsOutline(constitutionId, revisionId))
            .thenThrow(org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE))
            .thenReturn(ImportOutline(listOf(ImportOutlineKind("article", "Article"))))
        val body = """{"isoCode":"FR","countryName":"France","constitutionSlug":"new","constitutionTitle":"New constitution","constitutionId":"$constitutionId","settingsRevisionId":"$revisionId","versionLabel":"1","sourceUrl":"https://example.org/source","roots":[{"kind":"article","label":"1","content":[{"type":"text","text":"First article."}]}]}"""
        fun stage() = mockMvc.post("/import-jobs") {
            header("Authorization", MCP_TOKEN)
            header("Idempotency-Key", "retry-after-catalog-failure")
            contentType = MediaType.APPLICATION_JSON
            content = body
        }
        stage().andExpect { status { isServiceUnavailable() } }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM import_jobs WHERE idempotency_key = ?", Int::class.java, "retry-after-catalog-failure"))
        stage().andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("pending_review") }
        }
    }

    @Test
    fun directImportIdempotencyReplaysOnlyTheSamePayloadForTheSameSubmitter() {
        val body = """{"isoCode":"FR","countryName":"France","constitutionSlug":"retry-test","constitutionTitle":"Retry test","versionLabel":"1","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"articles":[{"articleNumber":"1","title":"First","sortOrder":1}]}"""
        fun stage(payload: String, token: String = TOKEN) = mockMvc.post("/import-jobs") {
            header("Authorization", token)
            header("Idempotency-Key", "retry-same-request")
            contentType = MediaType.APPLICATION_JSON
            content = payload
        }
        val first = stage(body).andExpect { status { isCreated() } }.andReturn()
        val again = stage(body).andExpect { status { isCreated() } }.andReturn()
        assertEquals(jobId(first.response.contentAsString), jobId(again.response.contentAsString))
        stage(body.replace("First", "Changed")).andExpect { status { isConflict() } }
        val other = stage(body, EDITOR_TOKEN).andExpect { status { isCreated() } }.andReturn()
        org.junit.jupiter.api.Assertions.assertNotEquals(jobId(first.response.contentAsString), jobId(other.response.contentAsString))
    }

    @Test
    fun customRootsForwardOrderedTextAndLiteralIdentities() {
        val constitution = UUID.randomUUID()
        val version = UUID.randomUUID()
        val logical = UUID.randomUUID()
        Mockito.`when`(catalogClient.getCountry("FR")).thenReturn(DownstreamCountry(UUID.randomUUID(), "FR", "France"))
        Mockito.`when`(catalogClient.findConstitution("FR", "ordered")).thenReturn(null)
        Mockito.`when`(catalogClient.createConstitution("FR", "ordered", "Ordered constitution"))
            .thenReturn(DownstreamConstitution(constitution, "ordered", "Ordered constitution"))
        stubDraft(version, constitution)
        val staged = mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"FR","countryName":"France","constitutionSlug":"ordered","constitutionTitle":"Ordered constitution","versionLabel":"1","sourceUrl":"https://example.org/test-import","outline":{"kinds":[{"kindCode":"clause","displayLabel":"Clause"}]},"roots":[{"logicalId":"$logical","kind":"clause","label":"(2a)","title":"Literal","content":[{"type":"text","text":"Before  "},{"type":"text","text":"after."}]}]}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("pending_review") }
        }.andReturn()
        confirmOutline(jobId(staged.response.contentAsString))
        prepare(jobId(staged.response.contentAsString))
        Mockito.verify(contentClient).replaceRoots(
            eqNonNull(version),
            Mockito.argThat<List<com.constitutionatlas.platform.OrderedNodeWrite>> { roots ->
                roots.single().logicalId == logical && roots.single().label == "(2a)" && roots.single().content!!.map { it.text } == listOf("Before  ", "after.")
            } ?: emptyList(),
        )
        Mockito.verify(contentClient, Mockito.never()).replaceArticles(eqNonNull(version), Mockito.anyList())
    }

    @Test
    fun successorImportForwardsLegalPredecessor() {
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000501")
        val predecessorId = UUID.fromString("01900000-0000-4000-8000-000000000502")
        val versionId = UUID.fromString("01900000-0000-4000-8000-000000000503")
        Mockito.`when`(catalogClient.getCountry("FR"))
            .thenReturn(DownstreamCountry(UUID.randomUUID(), "FR", "France"))
        Mockito.`when`(catalogClient.findConstitution("FR", "1958"))
            .thenReturn(DownstreamConstitution(constitutionId, "1958", "Constitution of 1958"))
        Mockito.`when`(catalogClient.currentSettingsRevisionId(constitutionId)).thenReturn(SETTINGS_REVISION)
        stubDraft(versionId, constitutionId)

        val staged = mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "isoCode": "FR",
                  "countryName": "France",
                  "constitutionSlug": "1958",
                  "constitutionTitle": "Constitution of 1958",
                  "versionLabel": "1962",
                  "sourceUrl": "https://example.org/test-import",
                  "settingsRevisionId": "$SETTINGS_REVISION",
                  "effectiveDate": "1962-11-06",
                  "predecessorVersionId": "$predecessorId",
                  "hopKind": "legal",
                  "articles": [
                    {"articleNumber": "1", "title": "Sovereignty", "body": "Sovereignty belongs to the people.", "sortOrder": 1}
                  ]
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("pending_review") }
        }.andReturn()
        prepare(jobId(staged.response.contentAsString)).andExpect { jsonPath("$.versionId") { value(versionId.toString()) } }
        Mockito.verify(catalogClient).createDraftVersion(
            eqNonNull(constitutionId),
            eqNonNull("1962"),
            eqNonNull(LocalDate.parse("1962-11-06")),
            eqNonNull("en"),
            eqNonNull("https://example.org/test-import"),
            Mockito.isNull(),
            eqNonNull(predecessorId),
            eqNonNull("legal"),
            anyUuid(),
            eqNonNull(SETTINGS_REVISION),
        )
    }

    @Test
    fun existingConstitutionRejectsAnUnpinnedOrStaleLayout() {
        val constitutionId = UUID.randomUUID()
        Mockito.`when`(catalogClient.getCountry("FR")).thenReturn(DownstreamCountry(UUID.randomUUID(), "FR", "France"))
        Mockito.`when`(catalogClient.findConstitution("FR", "existing"))
            .thenReturn(DownstreamConstitution(constitutionId, "existing", "Existing"))
        Mockito.`when`(catalogClient.currentSettingsRevisionId(constitutionId)).thenReturn(SETTINGS_REVISION)
        val staged = mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"FR","countryName":"France","constitutionSlug":"existing","constitutionTitle":"Existing","versionLabel":"1","sourceUrl":"https://example.org/test-import","settingsRevisionId":"${UUID.randomUUID()}","articles":[{"articleNumber":"1","title":"A","sortOrder":1}]}"""
        }.andExpect { status { isCreated() } }.andReturn()
        mockMvc.post("/import-jobs/${jobId(staged.response.contentAsString)}/prepare") {
            header("Authorization", TOKEN)
        }.andExpect { status { isConflict() } }
        Mockito.verify(catalogClient, Mockito.never()).createDraftVersion(
            anyUuid(), anyStr(), Mockito.nullable(LocalDate::class.java), anyStr(),
            Mockito.nullable(String::class.java), Mockito.nullable(String::class.java),
            Mockito.nullable(UUID::class.java), Mockito.nullable(String::class.java), anyUuid(), Mockito.nullable(UUID::class.java),
        )
        Mockito.verify(catalogClient, Mockito.never()).replaceOutline(anyUuid(), Mockito.anyList())
    }

    @Test
    fun treeFixtureImportAppliesOutlineAndSources() {
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000601")
        val versionId = UUID.fromString("01900000-0000-4000-8000-000000000602")
        stubCatalog(
            iso = "US",
            countryName = "United States",
            slug = "constitution",
            title = "Constitution of the United States",
            versionLabel = "1789",
            constitutionId = constitutionId,
            versionId = versionId,
            effectiveDate = LocalDate.parse("1789-03-04"),
            languageCode = "en",
            sourceUrl = "https://www.archives.gov/founding-docs/constitution-transcript",
            gazetteReference = "U.S. Const.",
        )

        val staged = mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = usFixture()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("pending_review") }
            jsonPath("$.isoCode") { value("US") }
        }.andReturn()
        confirmOutline(jobId(staged.response.contentAsString))
        prepare(jobId(staged.response.contentAsString)).andExpect { jsonPath("$.versionId") { value(versionId.toString()) } }
        Mockito.verify(catalogClient).replaceOutline(
            eqNonNull(constitutionId),
            Mockito.argThat<List<ImportOutlineKind>> { kinds -> kinds.any { it.kindCode == "section" } }
                ?: emptyList(),
        )
        Mockito.verify(catalogClient).createDraftVersion(
            eqNonNull(constitutionId),
            eqNonNull("1789"),
            eqNonNull(LocalDate.parse("1789-03-04")),
            eqNonNull("en"),
            eqNonNull("https://www.archives.gov/founding-docs/constitution-transcript"),
            eqNonNull("U.S. Const."),
            Mockito.isNull(),
            Mockito.isNull(),
            anyUuid(),
            Mockito.isNull(),
        )
        Mockito.verify(contentClient).replaceArticles(
            eqNonNull(versionId),
            Mockito.argThat<List<ImportArticle>> { articles ->
                articles.any { article -> article.nodes.any { node -> node.kind == "section" } }
            } ?: emptyList(),
        )
        Mockito.verify(catalogClient, Mockito.never()).publishVersion(eqNonNull(versionId), anyUuid())
    }

    @Test
    fun unknownKindFailsWithoutCatalogWrites() {
        mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "isoCode": "US",
                  "countryName": "United States",
                  "constitutionSlug": "constitution",
                  "constitutionTitle": "Constitution of the United States",
                  "versionLabel": "1789",
                  "sourceUrl": "https://example.org/test-import",
                  "outline": {
                    "kinds": [
                      {"kindCode":"article","displayLabel":"Article","presentation":"section","showLabel":true,"showTitle":true,"showKind":true}
                    ]
                  },
                  "articles": [
                    {
                      "articleNumber": "I",
                      "title": "Legislative Power",
                      "body": "",
                      "sortOrder": 1,
                      "nodes": [{"kind":"chapter","body":"All legislative Powers herein granted."}]
                    }
                  ]
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("failed") }
            jsonPath("$.errors[0].code") { value("UNKNOWN_KIND") }
        }
        Mockito.verifyNoInteractions(catalogClient)
        Mockito.verifyNoInteractions(contentClient)
    }

    @Test
    fun importRejectsDeeplyNestedJson() {
        mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = nestedJson(40)
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun importRequiresIdentityBearer() {
        mockMvc.post("/import-jobs") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "isoCode": "FR",
                  "countryName": "France",
                  "constitutionSlug": "1958",
                  "constitutionTitle": "Constitution of 1958",
                  "versionLabel": "1958",
                  "sourceUrl": "https://example.org/test-import",
                  "articles": [
                    {"articleNumber": "1", "title": "A", "body": "a", "sortOrder": 1}
                  ]
                }
            """.trimIndent()
        }.andExpect { status { isUnauthorized() } }
        Mockito.verifyNoInteractions(catalogClient)
        Mockito.verifyNoInteractions(contentClient)
    }

    private fun stubCatalog(
        iso: String,
        countryName: String,
        slug: String,
        title: String,
        versionLabel: String,
        constitutionId: UUID,
        versionId: UUID,
        effectiveDate: LocalDate? = null,
        languageCode: String = "en",
        sourceUrl: String? = null,
        gazetteReference: String? = null,
    ) {
        Mockito.`when`(catalogClient.getCountry(iso)).thenReturn(null)
        Mockito.`when`(catalogClient.createCountry(iso, countryName))
            .thenReturn(DownstreamCountry(UUID.randomUUID(), iso, countryName))
        Mockito.`when`(catalogClient.findConstitution(iso, slug)).thenReturn(null)
        Mockito.`when`(catalogClient.createConstitution(iso, slug, title))
            .thenReturn(DownstreamConstitution(constitutionId, slug, title))
        stubDraft(versionId, constitutionId)
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private const val REVIEWER_TOKEN = "Bearer reviewer-token"
        private const val PUBLISHER_TOKEN = "Bearer publisher-token"
        private const val EDITOR_TOKEN = "Bearer other-editor-token"
        private const val MCP_TOKEN = "Bearer scoped-mcp-key"
        private val SETTINGS_REVISION = UUID.fromString("01900000-0000-4000-8000-000000000504")

        private fun nestedJson(depth: Int): String = (1..depth).fold("1") { acc, _ -> """{"x":$acc}""" }

        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("ingestion.publish.token") { "test-publish-token" }
        }

        private fun usFixture(): String =
            checkNotNull(ImportApiTest::class.java.getResource("/fixtures/us-constitution.json")).readText()
    }
}

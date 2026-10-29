import com.constitutionatlas.ingestion.IngestionServiceApplication
import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.SetupProposalRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.client.DownstreamConstitution
import com.constitutionatlas.ingestion.client.DownstreamCountry
import com.constitutionatlas.ingestion.client.DownstreamSetupConstitution
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.ingestion.service.ImportService
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.UnauthorizedException
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
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
import tools.jackson.databind.json.JsonMapper
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

    @Autowired
    lateinit var objectMapper: JsonMapper

    @Autowired
    lateinit var jobs: com.constitutionatlas.ingestion.repo.ImportJobRepository

    @MockitoBean
    lateinit var catalogClient: CatalogClient

    @MockitoBean
    lateinit var contentClient: ContentClient

    @MockitoBean
    lateinit var identityClient: IdentityClient

    @MockitoBean
    lateinit var migrationDomains: com.constitutionatlas.ingestion.client.MigrationDomainClient

    private val admin =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000413"), "local-admin@example.local", listOf("admin"))
    private val reviewer = Actor(UUID.randomUUID(), "reviewer@example.local", listOf("reviewer"))
    private val publisher = Actor(UUID.randomUUID(), "publisher@example.local", listOf("publisher"), stepUpFresh = true)
    private val otherEditor = Actor(UUID.randomUUID(), "other-editor@example.local", listOf("editor"))
    private val scopedImporter = Actor(UUID.randomUUID(), "mcp@example.local", emptyList(), listOf("ingestion:import"))
    private val json = JsonMapper()

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

    @Test
    fun `Jackson 2 imports retain exact bytes and retry against persisted pre-upgrade hashes`() {
        val fixtures = mapOf(
            "legacy" to "fa390a8e25f94c57d363e5757d407c34c1c143f2c3444f1cce35fb43ba41928e",
            "ordered" to "d615418c8aeaed9b6302b2662756b9c62f28bad087672961314c79036000437d",
        )
        fixtures.forEach { (name, expectedHash) ->
            val input = checkNotNull(javaClass.getResourceAsStream("/jackson2-import-contracts/$name-input.json")).use { it.readBytes() }
            val expectedBytes = checkNotNull(javaClass.getResourceAsStream("/jackson2-import-contracts/$name-jackson2.json")).use { it.readBytes() }
            val request = objectMapper.readValue(input, ImportRequest::class.java)
            val bytes = objectMapper.writeValueAsBytes(request)
            assertArrayEquals(expectedBytes, bytes, "$name serialization changed from Jackson 2")
            assertEquals(expectedHash, MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) })
            val previousId = UUID.randomUUID()
            val key = "jackson2-$name-${UUID.randomUUID()}"
            jdbc.update(
                "INSERT INTO import_jobs (id, status, payload, submitted_by, idempotency_key, payload_sha256) VALUES (?, 'pending_review', ?::jsonb, ?, ?, ?)",
                previousId,
                expectedBytes.toString(Charsets.UTF_8),
                admin.id,
                key,
                expectedHash,
            )
            val retry = importService.importVersion(TOKEN, admin.id, request, idempotencyKey = key, expectedChecksum = expectedHash)
            assertEquals(previousId, retry.id)
        }
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

    private fun setupOperation(id: UUID): UUID = jdbc.queryForObject("SELECT confirmation_operation FROM import_setup_proposals WHERE id = ?", UUID::class.java, id)!!

    private fun reviewedSetup(slug: String): SetupProposalRequest = tools.jackson.module.kotlin.jacksonObjectMapper().readValue(
        """{"isoCode":"FR","countryName":"France","constitutionSlug":"$slug","constitutionTitle":"Reviewed charter","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"sampleRoots":[{"kind":"article","label":"1","content":[{"type":"text","text":"Exact reviewed words."}]}]}""",
        SetupProposalRequest::class.java,
    )

    @Test
    fun importArchiveIsOwnedReversibleAndPreservesTheJob() {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO import_jobs(id, status, payload, submitted_by) VALUES (?, 'pending_review', '{}'::jsonb, ?)", id, admin.id)
        fun archive(token: String, archived: Boolean) = mockMvc.post("/import-jobs/$id/archive") {
            header("Authorization", token)
            contentType = MediaType.APPLICATION_JSON
            content = """{"archived":$archived}"""
        }
        archive(TOKEN, true).andExpect { status { isConflict() } }
        jdbc.update("UPDATE import_jobs SET status = 'completed' WHERE id = ?", id)
        archive(EDITOR_TOKEN, true).andExpect { status { isForbidden() } }
        archive(TOKEN, true).andExpect { status { isNoContent() } }
        mockMvc.get("/import-jobs?mine=true&archived=true") { header("Authorization", TOKEN) }
            .andExpect { jsonPath("$[?(@.id == '$id')]") { isNotEmpty() } }
        mockMvc.get("/import-jobs?mine=true&archived=true") { header("Authorization", EDITOR_TOKEN) }
            .andExpect { jsonPath("$[?(@.id == '$id')]") { isEmpty() } }
        mockMvc.get("/import-jobs?mine=true") { header("Authorization", TOKEN) }
            .andExpect { jsonPath("$[?(@.id == '$id')]") { isEmpty() } }
        mockMvc.get("/import-jobs/$id") { header("Authorization", TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("completed") }
            }
        archive(TOKEN, false).andExpect { status { isNoContent() } }
        mockMvc.get("/import-jobs?mine=true") { header("Authorization", TOKEN) }
            .andExpect { jsonPath("$[?(@.id == '$id')]") { isNotEmpty() } }
        jdbc.update("UPDATE import_jobs SET status = 'failed' WHERE id = ?", id)
        archive(TOKEN, true).andExpect { status { isNoContent() } }
        assertEquals(null, jobs.claimPreparation(id, admin.id))
    }

    @Test
    fun setupLostResponseResumesTheSameReviewedOperationAfterRestart() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper)
        val service = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val request = reviewedSetup("lost-response-${UUID.randomUUID()}")
        val proposal = service.create(TOKEN, admin.id, request)
        val receipt = DownstreamSetupConstitution(UUID.randomUUID(), UUID.randomUUID())
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request))
            .thenThrow(IllegalStateException("Catalog committed but its response was lost"))
            .thenReturn(receipt)
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException::class.java) {
            service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        }
        assertEquals("confirming", repository.find(proposal.id)!!.status)
        assertEquals(null, repository.replace(proposal.id, request.copy(constitutionTitle = "Unreviewed"), proposal.revision))
        assertEquals(false, repository.withdraw(proposal.id, proposal.revision))
        Mockito.`when`(catalogClient.findConstitution("FR", request.constitutionSlug))
            .thenReturn(DownstreamConstitution(receipt.id, request.constitutionSlug, request.constitutionTitle))
        val restarted = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val confirmed = restarted.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        assertEquals("confirmed", confirmed.status)
        assertEquals(receipt.id, confirmed.constitutionId)
        assertEquals(receipt.settingsRevisionId, confirmed.settingsRevisionId)
        assertEquals(request, confirmed.payload)
        Mockito.verify(catalogClient, Mockito.times(2)).createSetupConstitution(setupOperation(proposal.id), request)
        Mockito.verify(catalogClient, Mockito.never()).replaceOutline(receipt.id, request.outline.kinds)
    }

    @Test
    fun setupResumesAfterCountryCreationLosesItsResponse() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper)
        val service = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val request = reviewedSetup("country-response-${UUID.randomUUID()}").copy(isoCode = "ZX", countryName = "Setup country")
        val proposal = service.create(TOKEN, admin.id, request)
        Mockito.`when`(catalogClient.getCountry("ZX")).thenReturn(null, DownstreamCountry(UUID.randomUUID(), "ZX", "Setup country"))
        Mockito.`when`(catalogClient.createCountry("ZX", "Setup country")).thenThrow(IllegalStateException("Country committed but response lost"))
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException::class.java) {
            service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        }
        val receipt = DownstreamSetupConstitution(UUID.randomUUID(), UUID.randomUUID())
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request)).thenReturn(receipt)
        val restarted = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        assertEquals(receipt.id, restarted.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision).constitutionId)
        Mockito.verify(catalogClient, Mockito.times(1)).createCountry("ZX", "Setup country")
        Mockito.verify(catalogClient, Mockito.times(1)).createSetupConstitution(setupOperation(proposal.id), request)
    }

    @Test
    fun legacyInterruptedSetupOnlyReconcilesItsRecordedConstitutionIdentity() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper)
        val request = reviewedSetup("legacy-confirmation-${UUID.randomUUID()}")
        val proposal = repository.insert(admin.id, request)
        val recorded = UUID.randomUUID()
        jdbc.update("UPDATE import_setup_proposals SET status = 'confirming', constitution_id = ? WHERE id = ?", recorded, proposal.id)
        Mockito.`when`(catalogClient.findConstitution("FR", request.constitutionSlug)).thenReturn(DownstreamConstitution(UUID.randomUUID(), request.constitutionSlug, request.constitutionTitle))
        val service = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.server.ResponseStatusException::class.java) {
            service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        }
        Mockito.verify(catalogClient, Mockito.never()).replaceOutline(recorded, request.outline.kinds)
        Mockito.`when`(catalogClient.findConstitution("FR", request.constitutionSlug)).thenReturn(DownstreamConstitution(recorded, request.constitutionSlug, request.constitutionTitle))
        Mockito.`when`(catalogClient.currentSettingsRevisionId(recorded)).thenReturn(SETTINGS_REVISION)
        assertEquals("confirmed", service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision).status)
        Mockito.verify(catalogClient).replaceOutline(recorded, request.outline.kinds)
        Mockito.verify(catalogClient, Mockito.never()).createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request)
    }

    @Test
    fun setupProcessDeathCanBeReclaimedWithoutChangingTheReviewedRevision() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper)
        val service = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val request = reviewedSetup("process-death-${UUID.randomUUID()}")
        val proposal = service.create(TOKEN, admin.id, request)
        val receipt = DownstreamSetupConstitution(UUID.randomUUID(), UUID.randomUUID())
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request)).thenAnswer { throw AssertionError("Simulated process termination") }
        org.junit.jupiter.api.Assertions.assertThrows(AssertionError::class.java) {
            service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        }
        mockMvc.post("/import-setup-proposals/${proposal.id}/confirm") {
            header("Authorization", TOKEN)
            header("If-Match", proposal.revision.toString())
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("setup_confirmation_running") }
        }
        // The claim survived the terminated process. An interrupted operation stays recoverable
        // even after the proposal's original review expiry; its reviewed bytes remain frozen.
        jdbc.update("UPDATE import_setup_proposals SET confirmation_started_at = now() - interval '3 minutes', expires_at = now() - interval '1 day' WHERE id = ?", proposal.id)
        Mockito.doReturn(receipt).`when`(catalogClient).createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request)
        val restarted = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val confirmed = restarted.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        assertEquals(receipt.id, confirmed.constitutionId)
        assertEquals(request, confirmed.payload)
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.server.ResponseStatusException::class.java) {
            restarted.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision + 1)
        }
    }

    @Test
    fun obsoleteSetupCallbacksCannotReleaseOrFinishARecoveryClaim() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper)
        val proposal = repository.insert(admin.id, reviewedSetup("fenced-setup-${UUID.randomUUID()}"))
        val old = repository.claim(proposal.id, proposal.revision)!!
        assertEquals(null, repository.claim(proposal.id, proposal.revision))
        jdbc.update("UPDATE import_setup_proposals SET confirmation_started_at = now() - interval '3 minutes' WHERE id = ?", proposal.id)
        val recovered = repository.claim(proposal.id, proposal.revision)!!
        repository.retry(proposal.id, old.attempt)
        assertEquals(null, repository.claim(proposal.id, proposal.revision))
        assertEquals(false, repository.confirm(proposal.id, old.attempt, UUID.randomUUID(), UUID.randomUUID(), admin.id))
        val constitution = UUID.randomUUID()
        assertEquals(true, repository.confirm(proposal.id, recovered.attempt, constitution, SETTINGS_REVISION, admin.id))
        repository.retry(proposal.id, old.attempt)
        assertEquals("confirmed", repository.find(proposal.id)!!.status)
        assertEquals(constitution, repository.find(proposal.id)!!.constitutionId)
    }

    @Test
    fun guaranteedNoWriteRejectionAllowsAnExplicitlyReviewedCorrectionWithANewOperation() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper)
        val service = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val request = reviewedSetup("rejected-${UUID.randomUUID()}")
        val proposal = service.create(TOKEN, admin.id, request)
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request))
            .thenThrow(com.constitutionatlas.ingestion.client.SetupCreationRejectedException())
        val rejected = org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.ingestion.api.ImportPublicationException::class.java) {
            service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        }
        assertEquals("setup_creation_rejected", rejected.code)
        assertEquals("proposed", repository.find(proposal.id)!!.status)
        val firstOperation = setupOperation(proposal.id)
        val revised = request.copy(constitutionSlug = "corrected-${UUID.randomUUID()}")
        val reviewed = service.revise(TOKEN, proposal.id, admin.id, true, revised, proposal.revision)
        val receipt = DownstreamSetupConstitution(UUID.randomUUID(), UUID.randomUUID())
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(revised) ?: revised)).thenReturn(receipt)
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.server.ResponseStatusException::class.java) {
            service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        }
        assertEquals(receipt.id, service.confirm(TOKEN, proposal.id, admin.id, true, reviewed.revision).constitutionId)
        org.junit.jupiter.api.Assertions.assertNotEquals(firstOperation, setupOperation(proposal.id))
    }

    @Test
    fun receiptConflictAndLegacyUncertaintyNeverUnfreezeTheReviewedProposal() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper)
        val service = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val request = reviewedSetup("receipt-conflict-${UUID.randomUUID()}")
        val proposal = service.create(TOKEN, admin.id, request)
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request))
            .thenThrow(org.springframework.web.client.HttpClientErrorException.create(org.springframework.http.HttpStatus.CONFLICT, "Conflict", org.springframework.http.HttpHeaders.EMPTY, "{\"code\":\"creation_attempt_mismatch\"}".toByteArray(), null))
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.client.HttpClientErrorException::class.java) {
            service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        }
        assertEquals("confirming", repository.find(proposal.id)!!.status)
        assertEquals(null, repository.replace(proposal.id, request.copy(constitutionTitle = "Changed"), proposal.revision))
        jdbc.update("UPDATE import_setup_proposals SET confirmation_legacy = true WHERE id = ?", proposal.id)
        Mockito.doThrow(com.constitutionatlas.ingestion.client.SetupCreationRejectedException()).`when`(catalogClient)
            .createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request)
        val failure = org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.ingestion.api.ImportPublicationException::class.java) {
            service.confirm(TOKEN, proposal.id, admin.id, true, proposal.revision)
        }
        assertEquals("setup_recovery_conflict", failure.code)
        assertEquals("confirming", repository.find(proposal.id)!!.status)
    }

    @Test
    fun operationsStatusRequiresItsScopeAndContainsOnlyAggregateQueueData() {
        mockMvc.get("/operations/status").andExpect { status { isUnauthorized() } }
        mockMvc.get("/operations/status") { header("Authorization", EDITOR_TOKEN) }.andExpect { status { isForbidden() } }
        val monitorToken = "Bearer aggregate-monitor"
        Mockito.`when`(identityClient.authenticate(monitorToken)).thenReturn(Actor(UUID.randomUUID(), "monitor", emptyList(), listOf("operations:read")))
        val job = jobs.insertPending(mapOf("private-source" to "Never return this payload"), admin.id)!!
        jdbc.update("UPDATE import_jobs SET status = 'preparing', updated_at = now() - interval '10 minutes' WHERE id = ?", job)
        val event = UUID.randomUUID()
        jdbc.update("INSERT INTO import_publication_outbox(id, import_job_id, event_type, payload, attempts, created_at) VALUES (?, ?, 'audit_publish', '{}'::jsonb, 2, now() - interval '10 minutes')", event, job)
        val setups = com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, tools.jackson.module.kotlin.jacksonObjectMapper())
        val setup = setups.insert(admin.id, reviewedSetup("monitored-${UUID.randomUUID()}"))
        val claim = setups.claim(setup.id, setup.revision)!!
        setups.retry(setup.id, claim.attempt)
        jdbc.update("UPDATE import_setup_proposals SET confirmation_requested_at = now() - interval '10 minutes' WHERE id = ?", setup.id)
        val response = mockMvc.get("/operations/status") { header("Authorization", monitorToken) }.andExpect {
            status { isOk() }
            jsonPath("$.service") { value("ingestion") }
        }.andReturn().response.contentAsString
        val queues = json.readTree(response).path("queues").associateBy { it.path("name").asText() }
        for (name in listOf("publication", "preparing", "confirming")) {
            org.junit.jupiter.api.Assertions.assertTrue(queues.getValue(name).path("pendingCount").asLong() >= 1)
            org.junit.jupiter.api.Assertions.assertTrue(queues.getValue(name).path("failedCount").asLong() >= 1)
            org.junit.jupiter.api.Assertions.assertTrue(queues.getValue(name).path("oldestAgeSeconds").asLong() >= 600)
        }
        org.junit.jupiter.api.Assertions.assertFalse(response.contains(job.toString()) || response.contains(event.toString()) || response.contains("private-source"))
        jdbc.update("UPDATE import_jobs SET status = 'pending_review' WHERE id = ?", job)
        jdbc.update("UPDATE import_publication_outbox SET delivered_at = now() WHERE id = ?", event)
        val recovered = setups.claim(setup.id, setup.revision)!!
        assertEquals(true, setups.confirm(setup.id, recovered.attempt, UUID.randomUUID(), SETTINGS_REVISION, admin.id))
    }

    @Test
    fun stalePreparationCannotFailOrReplaceARecoveredPublishedReceipt() {
        val job = jobs.insertPending(mapOf("isoCode" to "DE", "versionLabel" to "Fixture"), admin.id)!!
        val old = jobs.claimPreparation(job, admin.id)!!
        jobs.preparationFailed(job, old, "Lost response")
        assertEquals("failed", jobs.find(job)!!.status)
        val recovered = jobs.claimPreparation(job, admin.id)!!
        assertEquals(emptyList<com.constitutionatlas.ingestion.api.ImportErrorDto>(), jobs.find(job)!!.errors)
        val version = UUID.randomUUID()
        jobs.reserveVersion(job, version, recovered)
        jobs.prepared(job, version, recovered)
        jdbc.update("UPDATE import_jobs SET status = 'completed' WHERE id = ?", job)
        jobs.preparationFailed(job, old, "Late obsolete failure")
        jobs.prepared(job, version, old)
        assertEquals("completed", jobs.find(job)!!.status)
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException::class.java) { jobs.reserveVersion(job, UUID.randomUUID(), old) }
        assertEquals(version, jobs.find(job)!!.versionId)
    }

    @Test
    fun migrationPackagesResumeDependenciesWithoutDuplicateWritesOrScopeEscalation() {
        val manifest = """{"runKey":"pilot-${UUID.randomUUID()}","title":"Archive pilot","sources":[{"sourceKey":"source","url":"https://example.org/original"},{"sourceKey":"unavailable","url":"https://example.org/missing","disposition":"unavailable","reason":"Source is missing"}]}"""
        fun create() = mockMvc.post("/migration-runs") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = manifest
        }
        val run = jobId(
            create().andExpect {
                status { isCreated() }
                jsonPath("$.coverage.sources") { value(2) }
            }.andReturn().response.contentAsString,
        )
        create().andExpect {
            status { isCreated() }
            jsonPath("$.id") { value(run) }
        }
        fun stage(key: String, dependencies: String = "[]") = mockMvc.post("/migration-runs/$run/items") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"sourceKey":"$key","kind":"document","dependencies":$dependencies,"payload":{"title":"Original archive","sourceUrl":"https://example.org/original"}}"""
        }
        val parent = jobId(stage("parent").andExpect { status { isCreated() } }.andReturn().response.contentAsString)
        val child = jobId(stage("child", "[\"parent\"]").andExpect { status { isCreated() } }.andReturn().response.contentAsString)
        stage("parent").andExpect {
            status { isCreated() }
            jsonPath("$.id") { value(parent) }
        }
        mockMvc.post("/migration-runs/$run/items/$parent/prepare") { header("Authorization", MCP_TOKEN) }.andExpect { status { isForbidden() } }
        mockMvc.post("/migration-runs/$run/items/$child/prepare") { header("Authorization", EDITOR_TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.state") { value("blocked") }
        }
        val captured = json.readTree("""{"id":"${UUID.randomUUID()}","revision":{"id":"${UUID.randomUUID()}","revision":2}}""")
        Mockito.`when`(migrationDomains.capture(Mockito.any() ?: emptyMap<String, Any>(), Mockito.eq(EDITOR_TOKEN))).thenReturn(captured)
        listOf(parent, parent, child).forEach { item ->
            mockMvc.post("/migration-runs/$run/items/$item/prepare") { header("Authorization", EDITOR_TOKEN) }.andExpect {
                status { isOk() }
                jsonPath("$.state") { value("prepared") }
            }
        }
        Mockito.verify(migrationDomains, Mockito.times(2)).capture(Mockito.any() ?: emptyMap<String, Any>(), Mockito.eq(EDITOR_TOKEN))
        mockMvc.get("/migration-runs/$run") { header("Authorization", MCP_TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.coverage.prepared") { value(2) }
            jsonPath("$.coverage.unavailable") { value(1) }
        }
        val otherKey = "Bearer another-migration-importer"
        Mockito.`when`(identityClient.authenticate(otherKey)).thenReturn(scopedImporter.copy(id = UUID.randomUUID()))
        mockMvc.get("/migration-runs/$run") { header("Authorization", otherKey) }.andExpect { status { isForbidden() } }
    }

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
    fun chunkAssemblyValidatesEndnotesAcrossTheWholeConstitutionBeforePreparation() {
        val laterText = "x".repeat(600_000)
        val payload = """{"isoCode":"FR","countryName":"France","constitutionSlug":"notes","constitutionTitle":"Notes","versionLabel":"1","sourceUrl":"https://example.org/test-import","roots":[{"kind":"article","content":[{"type":"text","format":"footnote","text":"Source note"}]},{"kind":"article","content":[{"type":"text","text":"$laterText"}]}]}"""
        val item = assembleChunkedPayload(payload, "invalid-endnotes")
        mockMvc.get("/import-jobs/$item") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("failed") }
            jsonPath("$.errors[0].code") { value("FOOTNOTE_NOT_AT_END") }
        }
        Mockito.verifyNoInteractions(catalogClient, contentClient)
    }

    @Test
    fun directBatchAndChunkedImportsRequireMarkersAndAllowSharedNotes() {
        val note = UUID.randomUUID()
        for (count in listOf(0, 1, 3)) {
            val body = List(count) { index ->
                com.constitutionatlas.platform.OrderedNodeWrite(
                    kind = "article",
                    content = listOf(
                        com.constitutionatlas.platform.OrderedEntryWrite(
                            "text",
                            text = "Law",
                            references = listOf(com.constitutionatlas.platform.OrderedInlineReference(UUID.randomUUID(), 3, 3, com.constitutionatlas.platform.OrderedReferenceTarget("footnote", footnoteId = note))),
                        ),
                    ) + if (index == 0) listOf(com.constitutionatlas.platform.OrderedEntryWrite("text", text = "x".repeat(600_000))) else emptyList(),
                )
            }
            val request = ImportRequest(
                isoCode = "FR",
                countryName = "France",
                constitutionSlug = "shared-note-$count",
                constitutionTitle = "Shared notes",
                versionLabel = "1",
                sourceUrl = "https://example.org/test-import",
                roots = body + com.constitutionatlas.platform.OrderedNodeWrite(kind = "article", content = listOf(com.constitutionatlas.platform.OrderedEntryWrite("text", logicalId = note, text = "Shared source note", format = "footnote", footnoteLabel = "†"))),
            )
            val payload = objectMapper.writeValueAsString(request)
            val direct = jobId(
                mockMvc.post("/import-jobs") {
                    header("Authorization", TOKEN)
                    contentType = MediaType.APPLICATION_JSON
                    content = payload
                }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
            )
            val batch = jobId(mockMvc.post("/import-batches") { header("Authorization", TOKEN) }.andExpect { status { isCreated() } }.andReturn().response.contentAsString)
            val batched = jobId(
                mockMvc.post("/import-batches/$batch/items") {
                    header("Authorization", TOKEN)
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"idempotencyKey":"shared-notes-$count","payload":$payload}"""
                }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
            )
            val chunked = assembleChunkedPayload(payload, "shared-note-$count")
            for (id in listOf(direct, batched, chunked)) {
                mockMvc.get("/import-jobs/$id") { header("Authorization", TOKEN) }.andExpect {
                    status { isOk() }
                    jsonPath("$.status") { value(if (count == 0) "failed" else "pending_review") }
                    if (count == 0) {
                        jsonPath("$.errors[0].code") { value("FOOTNOTE_MARK_CARDINALITY") }
                    } else {
                        jsonPath("$.errors.length()") { value(0) }
                    }
                }
                if (count == 0) {
                    mockMvc.post("/import-jobs/$id/prepare") { header("Authorization", TOKEN) }.andExpect {
                        status { isBadRequest() }
                        jsonPath("$.code") { value("FOOTNOTE_MARK_CARDINALITY") }
                        jsonPath("$.path") { value("roots[0].content[0]") }
                        jsonPath("$.logicalId") { value(note.toString()) }
                    }
                }
            }
        }
        Mockito.verifyNoInteractions(catalogClient, contentClient)
    }

    @Test
    fun chunkAssemblyResolvesForwardNodeTextAndFootnoteTargetsAfterTheLastChunkArrives() {
        val target = UUID.randomUUID()
        val text = UUID.randomUUID()
        val note = UUID.randomUUID()
        val padding = "x".repeat(600_000)
        val payload = """{"isoCode":"FR","countryName":"France","constitutionSlug":"references","constitutionTitle":"References","versionLabel":"1","sourceUrl":"https://example.org/test-import","roots":[{"kind":"article","content":[{"type":"text","text":"See","references":[{"logicalId":"${UUID.randomUUID()}","start":0,"end":1,"target":{"type":"unit","logicalId":"$target"}},{"logicalId":"${UUID.randomUUID()}","start":1,"end":3,"target":{"type":"unit","logicalId":"$text"}},{"logicalId":"${UUID.randomUUID()}","start":0,"end":0,"target":{"type":"footnote","footnoteId":"$note"}}]},{"type":"text","text":"$padding"}]},{"logicalId":"$target","kind":"article","content":[{"type":"text","logicalId":"$text","text":"Target text"},{"type":"text","logicalId":"$note","text":"Source note","format":"footnote"}]}]}"""
        val item = assembleChunkedPayload(payload, "valid-cross-chunk")
        mockMvc.get("/import-jobs/$item") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("pending_review") }
            jsonPath("$.errors.length()") { value(0) }
        }
        val references = importService.stagedRequest(UUID.fromString(item))!!.roots.first().content!!.first().references
        assertEquals(listOf(target, text, note), references.map { it.target.logicalId ?: it.target.footnoteId })
        Mockito.verifyNoInteractions(catalogClient, contentClient)
    }

    private fun assembleChunkedPayload(payload: String, key: String): String {
        val batch = jobId(mockMvc.post("/import-batches") { header("Authorization", TOKEN) }.andExpect { status { isCreated() } }.andReturn().response.contentAsString)
        val bytes = payload.toByteArray()
        fun checksum(value: ByteArray) = MessageDigest.getInstance("SHA-256").digest(value).joinToString("") { "%02x".format(it) }
        val uploadId = jobId(
            mockMvc.post("/import-batches/$batch/uploads") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"idempotencyKey":"$key","checksumSha256":"${checksum(bytes)}","totalBytes":${bytes.size}}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )
        val chunkSize = com.constitutionatlas.ingestion.service.ImportUploadService.CHUNK_BYTES
        for ((index, start) in bytes.indices.step(chunkSize).withIndex()) {
            val chunk = bytes.copyOfRange(start, minOf(start + chunkSize, bytes.size))
            mockMvc.put("/import-uploads/$uploadId/chunks/$index") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"dataBase64":"${Base64.getEncoder().encodeToString(chunk)}","checksumSha256":"${checksum(chunk)}"}"""
            }.andExpect { status { isOk() } }
        }
        val assembled = mockMvc.post("/import-uploads/$uploadId/complete") { header("Authorization", TOKEN) }.andExpect { status { isOk() } }.andReturn()
        return json.readTree(assembled.response.contentAsString).path("itemId").asString()
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
    fun setupProposalRejectsInvalidLineBreakMetadataBeforeAnyImportIsCreated() {
        for (count in listOf("-1", "17", "1.5", "\"2\"", "null")) {
            val body = """{"isoCode":"FR","countryName":"France","constitutionSlug":"invalid-layout","constitutionTitle":"Reviewed charter","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"sampleRoots":[{"kind":"article","content":[{"type":"text","text":"Exact reviewed words.","lineBreaksBefore":$count}]}]}"""
            mockMvc.post("/import-setup-proposals") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect { status { isBadRequest() } }
        }
    }

    @Test
    fun setupProposalIsPrivateUntilAnEditorConfirmsItsOutline() {
        val constitutionId = UUID.randomUUID()
        val body = """{"isoCode":"FR","countryName":"France","constitutionSlug":"new-constitution","constitutionTitle":"New constitution","languageCode":"fr","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"sampleRoots":[{"kind":"article","label":"1","title":"Opening","content":[{"type":"text","text":"Sample text"}]}]}"""
        val response = mockMvc.post("/import-setup-proposals") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("proposed") }
        }.andReturn()
        val id = jobId(response.response.contentAsString)
        val reviewed = tools.jackson.module.kotlin.jacksonObjectMapper().readValue(body, SetupProposalRequest::class.java)
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(reviewed) ?: reviewed)).thenReturn(DownstreamSetupConstitution(constitutionId, SETTINGS_REVISION))
        mockMvc.get("/import-setup-proposals/$id") { header("Authorization", EDITOR_TOKEN) }
            .andExpect { status { isForbidden() } }
        mockMvc.post("/import-setup-proposals/$id/confirm") {
            header("Authorization", EDITOR_TOKEN)
            header("If-Match", "1")
        }
            .andExpect { status { isForbidden() } }
        mockMvc.post("/import-setup-proposals/$id/confirm") {
            header("Authorization", TOKEN)
            header("If-Match", "1")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("confirmed") }
                jsonPath("$.constitutionId") { value(constitutionId.toString()) }
                jsonPath("$.settingsRevisionId") { value(SETTINGS_REVISION.toString()) }
            }
        mockMvc.post("/import-setup-proposals/$id/confirm") {
            header("Authorization", TOKEN)
            header("If-Match", "1")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("confirmed") }
            }
        Mockito.verify(catalogClient, Mockito.times(1)).createSetupConstitution(setupOperation(UUID.fromString(id)), reviewed)
    }

    @Test
    fun setupFeedbackAndDisplayPreferencesSurviveAChatRevisionWithoutAllowingStaleConfirmation() {
        val body = """{"isoCode":"FR","countryName":"France","constitutionSlug":"feedback-review","constitutionTitle":"Review charter","languageCode":"fr","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"sampleRoots":[{"kind":"article","label":"1","content":[{"type":"text","text":"First sentence. Second sentence."}]}]}"""
        val created = mockMvc.post("/import-setup-proposals") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect {
            status { isCreated() }
            jsonPath("$.revision") { value(1) }
        }.andReturn()
        val id = jobId(created.response.contentAsString)
        mockMvc.post("/import-setup-proposals/$id/confirm") {
            header("Authorization", MCP_TOKEN)
            header("If-Match", "1")
        }
            .andExpect { status { isForbidden() } }
        mockMvc.post("/import-setup-proposals/$id/display") {
            header("Authorization", TOKEN)
            header("If-Match", "1")
            contentType = MediaType.APPLICATION_JSON
            content = """{"kinds":[{"kindCode":"article","displayLabel":"Article","allowedChildKinds":["sentence"]}]}"""
        }.andExpect { status { isBadRequest() } }
        mockMvc.post("/import-setup-proposals/$id/display") {
            header("Authorization", TOKEN)
            header("If-Match", "1")
            contentType = MediaType.APPLICATION_JSON
            content = """{"kinds":[{"kindCode":"article","displayLabel":"Article","title":"Changed source title"}]}"""
        }.andExpect { status { isBadRequest() } }
        mockMvc.post("/import-setup-proposals/$id/request-changes") {
            header("Authorization", REVIEWER_TOKEN)
            header("If-Match", "1")
            contentType = MediaType.APPLICATION_JSON
            content = """{"message":"Add a sentence layer, preserving the exact source wording."}"""
        }.andExpect { status { isForbidden() } }
        mockMvc.post("/import-setup-proposals/$id/request-changes") {
            header("Authorization", TOKEN)
            header("If-Match", "1")
            contentType = MediaType.APPLICATION_JSON
            content = """{"message":"Add a sentence layer, preserving the exact source wording."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.revision") { value(2) }
            jsonPath("$.changesRequested") { value(true) }
        }
        mockMvc.post("/import-setup-proposals/$id/confirm") {
            header("Authorization", TOKEN)
            header("If-Match", "2")
        }
            .andExpect { status { isConflict() } }
        mockMvc.post("/import-setup-proposals/$id/display") {
            header("Authorization", TOKEN)
            header("If-Match", "2")
            contentType = MediaType.APPLICATION_JSON
            content = """{"kinds":[{"kindCode":"article","displayLabel":"Art.","showKind":true}]}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.revision") { value(3) }
            jsonPath("$.payload.sampleRoots[0].kind") { value("article") }
        }
        val revised = body.replace("\"displayLabel\":\"Article\"", "\"displayLabel\":\"Article\",\"allowedChildKinds\":[\"sentence\"]")
            .replace("\"Article\",\"allowedChildKinds\":[\"sentence\"]}]", "\"Article\",\"allowedChildKinds\":[\"sentence\"]},{\"kindCode\":\"sentence\",\"displayLabel\":\"Sentence\",\"allowedChildKinds\":[]}]")
            .replace("{\"type\":\"text\",\"text\":\"First sentence. Second sentence.\"}", "{\"type\":\"child\",\"node\":{\"kind\":\"sentence\",\"content\":[{\"type\":\"text\",\"text\":\"First sentence.\"}]}},{\"type\":\"child\",\"node\":{\"kind\":\"sentence\",\"content\":[{\"type\":\"text\",\"text\":\"Second sentence.\"}]}}")
        mockMvc.put("/import-setup-proposals/$id") {
            header("Authorization", MCP_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = revised
        }.andExpect { status { isPreconditionRequired() } }
        mockMvc.put("/import-setup-proposals/$id") {
            header("Authorization", MCP_TOKEN)
            header("If-Match", "2")
            contentType = MediaType.APPLICATION_JSON
            content = revised
        }.andExpect { status { isConflict() } }
        mockMvc.put("/import-setup-proposals/$id") {
            header("Authorization", MCP_TOKEN)
            header("If-Match", "3")
            contentType = MediaType.APPLICATION_JSON
            content = revised
        }.andExpect {
            status { isOk() }
            jsonPath("$.revision") { value(4) }
            jsonPath("$.changesRequested") { value(false) }
            jsonPath("$.payload.outline.kinds[0].displayLabel") { value("Art.") }
            jsonPath("$.payload.sampleRoots[0].content[0].node.kind") { value("sentence") }
            jsonPath("$.previousPayload.sampleRoots[0].content[0].text") { value("First sentence. Second sentence.") }
        }
        mockMvc.get("/import-setup-proposals/$id") { header("Authorization", MCP_TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.requestedChanges") { value("Add a sentence layer, preserving the exact source wording.") }
        }
        mockMvc.post("/import-setup-proposals/$id/confirm") {
            header("Authorization", TOKEN)
            header("If-Match", "3")
        }
            .andExpect { status { isConflict() } }
        val reviewed = tools.jackson.module.kotlin.jacksonObjectMapper().readValue(jdbc.queryForObject("SELECT payload::text FROM import_setup_proposals WHERE id = ?", String::class.java, UUID.fromString(id)), SetupProposalRequest::class.java)
        Mockito.verify(catalogClient, Mockito.never()).createSetupConstitution(anyUuid(), Mockito.eq(reviewed) ?: reviewed)
        val constitutionId = UUID.randomUUID()
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(reviewed) ?: reviewed)).thenReturn(DownstreamSetupConstitution(constitutionId, SETTINGS_REVISION))
        mockMvc.post("/import-setup-proposals/$id/confirm") {
            header("Authorization", TOKEN)
            header("If-Match", "4")
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("confirmed") }
            }
    }

    @Test
    fun setupDisplayResponseDoesNotAdoptANewerChatRevisionForConfirmation() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = Mockito.spy(com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper))
        val service = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val request = mapper.readValue(
            """{"isoCode":"FR","countryName":"France","constitutionSlug":"display-race","constitutionTitle":"Reviewed title","languageCode":"fr","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"sampleRoots":[{"kind":"article","label":"1","content":[{"type":"text","text":"Sample"}]}]}""",
            com.constitutionatlas.ingestion.api.SetupProposalRequest::class.java,
        )
        val created = service.create(TOKEN, admin.id, request)
        Mockito.doAnswer { invocation ->
            val saved = invocation.callRealMethod() as com.constitutionatlas.ingestion.api.SetupProposalDto
            repository.replace(created.id, saved.payload.copy(constitutionTitle = "Unseen chat revision"), saved.revision)
            saved
        }.`when`(repository).display(
            anyUuid(),
            Mockito.anyLong(),
            Mockito.any(com.constitutionatlas.ingestion.api.SetupProposalRequest::class.java) ?: request,
            Mockito.any(tools.jackson.databind.JsonNode::class.java) ?: mapper.createObjectNode(),
        )
        val saved = service.display(created.id, admin.id, true, com.constitutionatlas.ingestion.api.SetupDisplayRequest(listOf(com.constitutionatlas.ingestion.api.SetupDisplayKind("article", "Art."))), created.revision)
        assertEquals(2, saved.revision.toInt())
        assertEquals("Reviewed title", saved.payload.constitutionTitle)
        assertEquals(3, service.get(created.id, admin.id, true).revision.toInt())
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.server.ResponseStatusException::class.java) {
            service.confirm(TOKEN, created.id, admin.id, true, saved.revision)
        }
        Mockito.verify(catalogClient, Mockito.never()).createConstitution("FR", "display-race", "Unseen chat revision")
    }

    @Test
    fun setupConfirmationRejectsARevisionThatChangedBeforeTheClaim() {
        val mapper = tools.jackson.module.kotlin.jacksonObjectMapper()
        val repository = Mockito.spy(com.constitutionatlas.ingestion.repo.SetupProposalRepository(jdbc, mapper))
        val service = com.constitutionatlas.ingestion.service.SetupProposalService(repository, catalogClient, mapper)
        val request = mapper.readValue(
            """{"isoCode":"FR","countryName":"France","constitutionSlug":"claim-race","constitutionTitle":"Original title","languageCode":"fr","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"sampleRoots":[{"kind":"article","label":"1","content":[{"type":"text","text":"Sample"}]}]}""",
            com.constitutionatlas.ingestion.api.SetupProposalRequest::class.java,
        )
        val created = service.create(TOKEN, admin.id, request)
        val revised = request.copy(constitutionTitle = "Revised title")
        val constitutionId = UUID.randomUUID()
        Mockito.`when`(catalogClient.createSetupConstitution(anyUuid(), Mockito.eq(revised) ?: revised))
            .thenReturn(DownstreamSetupConstitution(constitutionId, SETTINGS_REVISION))
        var revisedBeforeClaim = false
        Mockito.doAnswer { invocation ->
            val snapshot = invocation.callRealMethod()
            if (!revisedBeforeClaim) {
                revisedBeforeClaim = true
                assertEquals(created.revision + 1, repository.replace(created.id, revised, created.revision)?.revision)
            }
            snapshot
        }.`when`(repository).find(created.id)

        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.web.server.ResponseStatusException::class.java) {
            service.confirm(TOKEN, created.id, admin.id, true, created.revision)
        }
        Mockito.verify(catalogClient, Mockito.never()).createSetupConstitution(anyUuid(), Mockito.eq(revised) ?: revised)
        Mockito.verify(catalogClient, Mockito.never()).createSetupConstitution(anyUuid(), Mockito.eq(request) ?: request)
        val confirmed = service.confirm(TOKEN, created.id, admin.id, true, created.revision + 1)
        assertEquals("confirmed", confirmed.status)
        assertEquals("Revised title", confirmed.payload.constitutionTitle)
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
                Mockito.nullable(com.constitutionatlas.platform.SourceEvidence::class.java),
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
        Mockito.`when`(contentClient.snapshot(versionId)).thenReturn(OrderedSnapshot(versionId, 1, SETTINGS_REVISION, emptyList()))

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
            jsonPath("$.countryName") { value("France") }
            jsonPath("$.constitutionTitle") { value("Constitution of 1958") }
            jsonPath("$.versionLabel") { value("1958") }
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
    fun sameAdminCanSubmitApproveAndPublishWithFreshMfa() {
        val constitutionId = UUID.randomUUID()
        val versionId = UUID.randomUUID()
        stubCatalog("FR", "France", "1958", "Constitution of 1958", "1958", constitutionId, versionId)
        Mockito.`when`(contentClient.snapshot(versionId)).thenReturn(OrderedSnapshot(versionId, 1, SETTINGS_REVISION, emptyList()))
        val staged = mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"FR","countryName":"France","constitutionSlug":"1958","constitutionTitle":"Constitution of 1958","versionLabel":"1958","sourceUrl":"https://example.org/source","outline":{"kinds":[{"kindCode":"article","displayLabel":"Article"}]},"articles":[{"articleNumber":"1","title":"Sovereignty","body":"France is a republic.","sortOrder":1}]}"""
        }.andExpect { status { isCreated() } }.andReturn()
        val id = jobId(staged.response.contentAsString)
        confirmOutline(id)
        prepare(id)
        mockMvc.post("/import-jobs/$id/approve") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"reason":"Verified my imported draft against the source."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("approved") }
            jsonPath("$.approvedBy") { value(admin.id.toString()) }
        }
        Mockito.verify(catalogClient, Mockito.never()).publishVersion(anyUuid(), anyUuid())
        mockMvc.post("/import-jobs/$id/publish") { header("Authorization", TOKEN) }
            .andExpect { status { isForbidden() } }
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(admin.copy(stepUpFresh = true))
        mockMvc.post("/import-jobs/$id/publish") { header("Authorization", TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.status") { value("completed") }
                jsonPath("$.submittedBy") { value(admin.id.toString()) }
                jsonPath("$.approvedBy") { value(admin.id.toString()) }
                jsonPath("$.publishedBy") { value(admin.id.toString()) }
            }
        mockMvc.get("/import-jobs/$id/decisions") { header("Authorization", TOKEN) }
            .andExpect {
                jsonPath("$.length()") { value(1) }
                jsonPath("$[0].decidedBy") { value(admin.id.toString()) }
            }
        Mockito.verify(catalogClient, Mockito.times(1)).publishVersion(versionId, UUID.fromString(id))
    }

    @Test
    fun submitterCanRejectOwnImportWithARecordedReason() {
        val staged = mockMvc.post("/import-jobs") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"FR","countryName":"France","constitutionSlug":"rejected","constitutionTitle":"Constitution","versionLabel":"1","sourceUrl":"https://example.org/source","articles":[{"articleNumber":"1","title":"First","sortOrder":1}]}"""
        }.andExpect { status { isCreated() } }.andReturn()
        val id = jobId(staged.response.contentAsString)
        mockMvc.post("/import-jobs/$id/reject") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"reason":"My uploaded text needs corrections before review."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("rejected") }
        }
        mockMvc.get("/import-jobs/$id/decisions") { header("Authorization", TOKEN) }
            .andExpect {
                jsonPath("$[0].decision") { value("rejected") }
                jsonPath("$[0].decidedBy") { value(admin.id.toString()) }
                jsonPath("$[0].reason") { value("My uploaded text needs corrections before review.") }
            }
    }

    @Test
    fun publishedCatalogVersionIsReconciledAfterInterruptedCompletion() {
        val constitutionId = UUID.randomUUID()
        val versionId = UUID.randomUUID()
        stubCatalog("FR", "France", "1958", "Constitution of 1958", "1958", constitutionId, versionId)
        Mockito.`when`(contentClient.snapshot(versionId)).thenReturn(OrderedSnapshot(versionId, 1, SETTINGS_REVISION, emptyList()))
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
            Mockito.isNull(),
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
            Mockito.nullable(com.constitutionatlas.platform.SourceEvidence::class.java),
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
            Mockito.nullable(com.constitutionatlas.platform.SourceEvidence::class.java),
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
            Mockito.nullable(com.constitutionatlas.platform.SourceEvidence::class.java),
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
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

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

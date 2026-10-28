import com.constitutionatlas.catalog.CatalogServiceApplication
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.CorrelationIdFilter
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import org.assertj.core.api.Assertions.assertThat
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
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.io.File
import java.util.UUID

@Testcontainers
@Sql(scripts = ["/fixtures/demo_catalog.sql"], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_CLASS)
@AutoConfigureMockMvc
@SpringBootTest(classes = [CatalogServiceApplication::class])
class CatalogApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var settingsRepository: com.constitutionatlas.catalog.repo.SettingsRepository

    @Autowired
    lateinit var catalogRepository: com.constitutionatlas.catalog.repo.CatalogRepository

    @MockitoBean
    lateinit var archiveTargets: com.constitutionatlas.catalog.client.ArchiveTargetClient

    @MockitoBean
    lateinit var settingsUsage: com.constitutionatlas.catalog.client.SettingsUsageClient

    @Autowired lateinit var writes: com.constitutionatlas.catalog.service.CatalogWriteService

    @Autowired lateinit var lifecycle: com.constitutionatlas.catalog.service.LifecycleService

    @Autowired lateinit var wiki: com.constitutionatlas.catalog.service.WikiService

    @Autowired lateinit var provisionLifecycle: com.constitutionatlas.catalog.service.ProvisionLifecycleService

    @MockitoBean lateinit var provisionScope: com.constitutionatlas.catalog.client.ProvisionScope

    @MockitoBean lateinit var wikiMedia: com.constitutionatlas.catalog.client.WikiMedia

    @MockitoBean lateinit var readiness: com.constitutionatlas.catalog.client.SuccessorReadinessClient

    @MockitoBean
    lateinit var identityClient: IdentityClient

    private val editor =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000410"), "local-editor@example.local", listOf("editor"))
    private val publisher =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000412"), "local-publisher@example.local", listOf("publisher"))
    private val viewer =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000414"), "local-viewer@example.local", listOf("viewer"))

    // Keep generated countries separate from fixed fixtures and independent of randomness.
    private fun uniqueCountryCode(): String = ('A'..'Z').asSequence().map { "Q$it" }
        .first { catalogRepository.findCountrySummary(it) == null }

    @Test
    fun constitutionCreationRetriesReturnTheOriginalReviewedSettingsAndRejectDifferentPayloads() {
        val country = writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(uniqueCountryCode(), "Setup receipt"))
        val attempt = UUID.randomUUID()
        val kind = com.constitutionatlas.catalog.api.OutlineKindWrite("article", "Reviewed article", root = true, allowedChildKinds = emptyList())
        val request = com.constitutionatlas.catalog.api.CreateConstitutionRequest("setup-receipt", "Reviewed title", listOf(kind), creationAttemptId = attempt)
        val created = writes.createConstitution(country.isoCode, request)
        val replay = writes.createJurisdictionConstitution(country.id, request)
        assertThat(replay).isEqualTo(created)
        assertThat(created.settingsRevisionId).isNotNull()
        assertThat(created.contentOutline.kinds.single().displayLabel).isEqualTo("Reviewed article")
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM constitutions WHERE jurisdiction_id = ? AND slug = ?", Int::class.java, country.id, request.slug)).isEqualTo(1)
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM constitution_settings_revisions WHERE constitution_id = ?", Int::class.java, created.id)).isEqualTo(1)

        writes.replaceOutline(created.id, listOf(kind.copy(displayLabel = "Later label")))
        assertThat(settingsRepository.currentId(created.id)).isNotEqualTo(created.settingsRevisionId)
        assertThat(writes.createConstitution(country.isoCode, request)).isEqualTo(created)
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) {
            writes.createConstitution(country.isoCode, request.copy(title = "Unreviewed title"))
        }
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) {
            writes.createConstitution(country.isoCode, request.copy(creationAttemptId = UUID.randomUUID()))
        }
        val other = writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(uniqueCountryCode(), "Other owner"))
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) {
            writes.createJurisdictionConstitution(other.id, request)
        }
    }

    @Test
    fun invalidSetupOutlineRollsBackConstitutionAndCreationReceiptTogether() {
        val country = writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(uniqueCountryCode(), "Setup rollback"))
        val attempt = UUID.randomUUID()
        val kind = com.constitutionatlas.catalog.api.OutlineKindWrite("article", "Article", allowedChildKinds = listOf("missing"))
        val request = com.constitutionatlas.catalog.api.CreateConstitutionRequest("setup-rollback", "Setup", listOf(kind), creationAttemptId = attempt)
        assertThat(org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) { writes.createConstitution(country.isoCode, request) }.code).isEqualTo("constitution_creation_rejected")
        assertThat(catalogRepository.findConstitutionId(country.id, request.slug)).isNull()
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM constitution_creation_receipts WHERE id = ?", Int::class.java, attempt)).isZero()
        val valid = request.copy(outline = listOf(kind.copy(allowedChildKinds = emptyList())))
        assertThat(writes.createConstitution(country.isoCode, valid).settingsRevisionId).isNotNull()
    }

    @Test
    fun concurrentSetupCreationSharesOneConstitutionAndReceipt() {
        val country = writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(uniqueCountryCode(), "Concurrent setup"))
        val request = com.constitutionatlas.catalog.api.CreateConstitutionRequest("concurrent-setup", "Reviewed charter", creationAttemptId = UUID.randomUUID())
        val ready = java.util.concurrent.CyclicBarrier(2)
        val executor = java.util.concurrent.Executors.newFixedThreadPool(2)
        try {
            val results = (1..2).map {
                executor.submit<com.constitutionatlas.catalog.api.ConstitutionSummary> {
                    ready.await(5, java.util.concurrent.TimeUnit.SECONDS)
                    writes.createConstitution(country.isoCode, request)
                }
            }.map { it.get(10, java.util.concurrent.TimeUnit.SECONDS) }
            assertThat(results[0]).isEqualTo(results[1])
            assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM constitutions WHERE jurisdiction_id = ? AND slug = ?", Int::class.java, country.id, request.slug)).isEqualTo(1)
            assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM constitution_creation_receipts WHERE id = ?", Int::class.java, request.creationAttemptId)).isEqualTo(1)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun curatedComparisonsPinDistinctConstitutionsAndRequireReviewAndFreshPublication() {
        val code = uniqueCountryCode()
        mockMvc.post("/countries") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"$code","name":"Comparison test"}"""
        }.andExpect { status { isCreated() } }
        val country = catalogRepository.findCountrySummary(code)!!
        val constitutions = (1..2).map { writes.createJurisdictionConstitution(country.id, com.constitutionatlas.catalog.api.CreateConstitutionRequest("charter-$it", "Charter $it")) }
        val versions = constitutions.map { constitution -> writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("1849")) }
        versions.forEach { version -> mockMvc.post("/versions/${version.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }.andExpect { status { isOk() } } }
        val logical = listOf(UUID.randomUUID(), UUID.randomUUID())
        versions.forEachIndexed { index, version ->
            val snapshot = com.constitutionatlas.platform.OrderedSnapshot(version.id, 1, UUID.randomUUID(), listOf(com.constitutionatlas.platform.OrderedNode(logical[index], UUID.randomUUID(), UUID.randomUUID(), "article", "1", null, listOf(com.constitutionatlas.platform.OrderedEntry("text", logicalId = UUID.randomUUID(), text = "Exact historic wording $index")))))
            Mockito.`when`(archiveTargets.snapshot(Mockito.eq(version.id) ?: version.id, Mockito.nullable(String::class.java))).thenReturn(snapshot)
        }
        val documentId = UUID.randomUUID()
        Mockito.`when`(archiveTargets.document(Mockito.eq(documentId) ?: documentId, Mockito.eq(1), Mockito.nullable(String::class.java))).thenReturn(objectMapper.readTree("""{"id":"$documentId","revision":{"revision":1,"fileName":"comparison.htm"}}"""))
        val body = objectMapper.writeValueAsString(
            mapOf(
                "attemptId" to UUID.randomUUID(),
                "title" to "Historic rights",
                "attribution" to "Archive editor",
                "sourceUrl" to "https://www.verfassungen.de/vergleiche1849-1990.htm",
                "sourceDocumentId" to documentId,
                "sourceDocumentRevision" to 1,
                "columns" to constitutions.mapIndexed { index, constitution -> mapOf("constitutionId" to constitution.id, "versionId" to versions[index].id, "label" to "Text $index") },
                "topics" to listOf(mapOf("title" to "Rights", "passages" to listOf(mapOf("column" to 0, "logicalId" to logical[0])), "missingColumns" to listOf(1))),
            ),
        )
        fun create() = mockMvc.post("/curated-comparisons") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }
        val id = objectMapper.readTree(create().andExpect { status { isCreated() } }.andReturn().response.contentAsString).path("id").asText()
        create().andExpect {
            status { isCreated() }
            jsonPath("$.id") { value(id) }
        }
        mockMvc.get("/curated-comparisons/$id").andExpect { status { isNotFound() } }
        val importerToken = "Bearer comparison-importer"
        Mockito.`when`(identityClient.authenticate(importerToken)).thenReturn(Actor(UUID.randomUUID(), "importer@example.local", emptyList(), listOf("ingestion:import")))
        mockMvc.get("/curated-comparisons/$id") { header("Authorization", importerToken) }.andExpect { status { isNotFound() } }
        mockMvc.post("/curated-comparisons/$id/review") {
            header("Authorization", importerToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"reason":"Source comparison checked."}"""
        }.andExpect { status { isForbidden() } }
        val reviewerToken = "Bearer comparison-reviewer"
        Mockito.`when`(identityClient.authenticate(reviewerToken)).thenReturn(editor.copy(roles = listOf("reviewer")))
        mockMvc.post("/curated-comparisons/$id/review") {
            header("Authorization", reviewerToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"reason":"Checked all source correspondences and missing counterparts."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.state") { value("reviewed") }
        }
        mockMvc.post("/curated-comparisons/$id/publish") { header("Authorization", PUBLISHER_TOKEN) }.andExpect { status { isForbidden() } }
        val fresh = "Bearer comparison-fresh-publisher"
        Mockito.`when`(identityClient.authenticate(fresh)).thenReturn(publisher.copy(stepUpFresh = true))
        mockMvc.post("/curated-comparisons/$id/publish") { header("Authorization", fresh) }.andExpect {
            status { isOk() }
            jsonPath("$.state") { value("published") }
        }
        mockMvc.get("/curated-comparisons/$id").andExpect {
            status { isOk() }
            jsonPath("$.definition.topics[0].missingColumns[0]") { value(1) }
            jsonPath("$.needsReview") { value(false) }
        }
        val correction = writes.createDraftVersion(constitutions[0].id, com.constitutionatlas.catalog.api.CreateVersionRequest("1849 r2", predecessorVersionId = versions[0].id, hopKind = "editorial_correction"))
        mockMvc.post("/versions/${correction.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }.andExpect { status { isOk() } }
        mockMvc.get("/curated-comparisons/$id").andExpect {
            status { isOk() }
            jsonPath("$.needsReview") { value(true) }
            jsonPath("$.definition.columns[0].versionId") { value(versions[0].id.toString()) }
        }
        mockMvc.post("/curated-comparisons/$id/review") {
            header("Authorization", reviewerToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"reason":"Cannot rewrite a published mapping."}"""
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun legacyMappingsKeepExactHistoricalTargetsAndRejectAmbiguousOrExternalRedirects() {
        val historical = "01900000-0000-4000-8000-000000000003"
        val later = "01900000-0000-4000-8000-000000000004"
        val source = "https://www.verfassungen.de/gg.htm#old-${UUID.randomUUID()}"
        val body = """{"sourceUrl":"$source","kind":"version","versionId":"$historical"}"""
        mockMvc.post("/legacy-mappings") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }
        mockMvc.get("/legacy-resolve") { param("url", source) }.andExpect {
            status { isOk() }
            jsonPath("$.targetUrl") { value("/countries/DE/versions/$historical") }
        }
        mockMvc.post("/legacy-mappings") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body.replace(historical, later)
        }.andExpect { status { isConflict() } }
        mockMvc.get("/legacy-resolve") { param("url", "$source-missing") }.andExpect { status { isNotFound() } }
        mockMvc.post("/legacy-mappings") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body.replace("www.verfassungen.de", "attacker.example")
        }.andExpect { status { isBadRequest() } }
        mockMvc.post("/legacy-mappings") {
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isUnauthorized() } }
        val version = UUID.fromString(historical)
        val logical = UUID.randomUUID()
        val occurrence = UUID.randomUUID()
        val note = UUID.randomUUID()
        val noteOccurrence = UUID.randomUUID()
        val snapshot = com.constitutionatlas.platform.OrderedSnapshot(version, 1, UUID.randomUUID(), listOf(com.constitutionatlas.platform.OrderedNode(logical, UUID.randomUUID(), occurrence, "article", "1", null, listOf(com.constitutionatlas.platform.OrderedEntry("text", logicalId = note, occurrenceId = noteOccurrence, text = "Editorial note", format = "footnote")))))
        Mockito.`when`(archiveTargets.snapshot(Mockito.eq(version) ?: version, Mockito.nullable(String::class.java))).thenReturn(snapshot)
        for ((kind, target, fragment) in listOf(Triple("unit", logical, occurrence.toString()), Triple("note", note, "fn-$noteOccurrence"))) {
            val url = "https://www.verfassungen.de/gg.htm#$target"
            mockMvc.post("/legacy-mappings") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"sourceUrl":"$url","kind":"$kind","versionId":"$version","logicalId":"$target"}"""
            }.andExpect { status { isCreated() } }
            mockMvc.get("/legacy-resolve") { param("url", url) }.andExpect {
                status { isOk() }
                jsonPath("$.targetUrl") { value("/countries/DE/versions/$version#$fragment") }
            }
        }
    }

    @Test
    fun archivalEvidenceSurvivesPublicationAndEditorialCorrectionWithoutInventedDates() {
        val evidence = com.constitutionatlas.platform.SourceEvidence("nach 1849", "uncertain", "Original with later notes", "aktuell (archived wording)", "Legacy archive")
        val code = uniqueCountryCode()
        mockMvc.post("/countries") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"$code","name":"Archive evidence test"}"""
        }.andExpect { status { isCreated() } }
        val country = catalogRepository.findCountrySummary(code)!!
        val constitution = writes.createJurisdictionConstitution(country.id, com.constitutionatlas.catalog.api.CreateConstitutionRequest("archive-${UUID.randomUUID()}", "Archive"))
        val first = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("1849", sourceEvidence = evidence))
        mockMvc.post("/versions/${first.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }.andExpect { status { isOk() } }
        mockMvc.get("/versions/${first.id}").andExpect {
            status { isOk() }
            jsonPath("$.effectiveDate") { value(org.hamcrest.Matchers.nullValue()) }
            jsonPath("$.sourceEvidence.dateWording") { value("nach 1849") }
            jsonPath("$.sourceEvidence.datePrecision") { value("uncertain") }
            jsonPath("$.sourceEvidence.statusWording") { value("aktuell (archived wording)") }
        }
        val correction = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("1849 r2", predecessorVersionId = first.id, hopKind = "editorial_correction"))
        assertThat(catalogRepository.findVersion(correction.id)?.sourceEvidence).isEqualTo(evidence)
        assertThat(catalogRepository.findVersion(first.id)?.sourceEvidence).isEqualTo(evidence)
        mockMvc.post("/versions/${correction.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }.andExpect { status { isOk() } }
        val freeDescription = com.constitutionatlas.platform.SourceEvidence(description = "# Archive\n\n[Original source](https://example.org)\n\nEditorially designed description")
        val designed = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("1849 r3", predecessorVersionId = correction.id, hopKind = "editorial_correction", sourceEvidence = freeDescription))
        assertThat(catalogRepository.findVersion(designed.id)?.sourceEvidence).isEqualTo(freeDescription)
        assertThat(catalogRepository.findVersion(first.id)?.sourceEvidence).isEqualTo(evidence)
    }

    @Test
    fun historicalCountriesAndRegionsPublishConstitutionsWithoutIsoCodes() {
        val countryResponse = mockMvc.post("/jurisdictions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"former-union-${UUID.randomUUID()}","name":"Former union","kind":"country","historical":true,"existedFrom":"1800-01-01","existedUntil":"1900-12-31"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.historical") { value(true) }
            jsonPath("$.code") { value(org.hamcrest.Matchers.nullValue()) }
            jsonPath("$.existedFrom") { value("1800-01-01") }
            jsonPath("$.existedUntil") { value("1900-12-31") }
        }.andReturn().response
        val countryId = objectMapper.readTree(countryResponse.contentAsString)["id"].asText()
        val regionResponse = mockMvc.post("/jurisdictions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentId":"$countryId","slug":"former-region","name":"Former region","kind":"region","historical":true}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        val regionId = objectMapper.readTree(regionResponse.contentAsString)["id"].asText()
        listOf(countryId, regionId).forEach { jurisdictionId ->
            val constitution = writes.createJurisdictionConstitution(UUID.fromString(jurisdictionId), com.constitutionatlas.catalog.api.CreateConstitutionRequest("charter", "Historical charter"))
            val version = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("1"))
            mockMvc.post("/versions/${version.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }
                .andExpect { status { isOk() } }
            mockMvc.get("/jurisdictions/$jurisdictionId").andExpect {
                status { isOk() }
                jsonPath("$.jurisdiction.historical") { value(true) }
                jsonPath("$.constitutions[0].versions[0].id") { value(version.id.toString()) }
            }
            mockMvc.get("/versions/${version.id}").andExpect {
                status { isOk() }
                jsonPath("$.jurisdictionId") { value(jurisdictionId) }
                jsonPath("$.countryCode") { value(org.hamcrest.Matchers.nullValue()) }
            }
        }
        mockMvc.get("/jurisdictions/$regionId").andExpect {
            status { isOk() }
            jsonPath("$.ancestors[0].id") { value(countryId) }
            jsonPath("$.ancestors[0].historical") { value(true) }
        }
        assertThat(catalogRepository.listCountries().map { it.id.toString() }).doesNotContain(countryId, regionId)
    }

    @Test
    fun historicalJurisdictionsCanReuseCodesWithoutChangingCurrentCountryIdentity() {
        val currentCountry = catalogRepository.findCountrySummary("DE")!!
        val historicalIds = (1..2).map { index ->
            val response = mockMvc.post("/jurisdictions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"slug":"earlier-entity-$index-${UUID.randomUUID()}","name":"Repeated name","kind":"country","historical":true,"code":"DE"}"""
            }.andExpect { status { isCreated() } }.andReturn().response
            objectMapper.readTree(response.contentAsString)["id"].asText()
        }
        assertThat(historicalIds).doesNotHaveDuplicates().doesNotContain(currentCountry.id.toString())
        assertThat(catalogRepository.findCountrySummary("DE")?.id).isEqualTo(currentCountry.id)
        mockMvc.get("/jurisdictions?parentId=${currentCountry.id}").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun jurisdictionExistenceDatesAreOptionalAndValidated() {
        val slug = "uncoded-country-${UUID.randomUUID()}"
        mockMvc.post("/jurisdictions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"$slug","name":"Country without an ISO assignment","kind":"country"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.historical") { value(false) }
            jsonPath("$.existedFrom") { value(org.hamcrest.Matchers.nullValue()) }
            jsonPath("$.existedUntil") { value(org.hamcrest.Matchers.nullValue()) }
        }
        listOf(
            """{"slug":"invalid-dates","name":"Former region","kind":"region","historical":true,"existedFrom":"1900-01-01","existedUntil":"1800-01-01"}""",
            """{"slug":"missing-historical","name":"Former region","kind":"region","existedUntil":"1900-01-01"}""",
        ).forEach { invalid ->
            mockMvc.post("/jurisdictions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = invalid
            }.andExpect { status { isBadRequest() } }
        }
        val code = uniqueCountryCode()
        mockMvc.post("/jurisdictions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"${code.lowercase()}","code":"$code","name":"Current country","kind":"country","existedFrom":"1900-01-01"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.existedFrom") { value("1900-01-01") }
        }
    }

    @Test
    fun localConstitutionsUseTheirOwnJurisdictionAtEveryDepth() {
        val code = uniqueCountryCode()
        val country = writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(code, "Hierarchy country"))
        var parentId = country.id.toString()
        val ancestors = mutableListOf(parentId)
        listOf("region", "subregion", "municipality", "district", "district").forEachIndexed { index, kind ->
            val response = mockMvc.post("/jurisdictions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"parentId":"$parentId","slug":"level-$index","name":"Level $index","kind":"$kind"}"""
            }.andExpect { status { isCreated() } }.andReturn().response
            val childId = objectMapper.readTree(response.contentAsString)["id"].asText()
            mockMvc.get("/jurisdictions?parentId=$parentId").andExpect {
                status { isOk() }
                jsonPath("$[0].id") { value(childId) }
            }
            mockMvc.get("/jurisdictions/$childId").andExpect {
                status { isOk() }
                jsonPath("$.ancestors[*].id") { value(org.hamcrest.Matchers.contains(*ancestors.toTypedArray())) }
            }
            ancestors.add(childId)
            parentId = childId
        }
        val constitution = mockMvc.post("/jurisdictions/$parentId/constitutions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"charter","title":"Local charter"}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        val constitutionId = UUID.fromString(objectMapper.readTree(constitution.contentAsString)["id"].asText())
        val version = writes.createDraftVersion(constitutionId, com.constitutionatlas.catalog.api.CreateVersionRequest("1"))
        mockMvc.get("/jurisdictions/$parentId").andExpect {
            status { isOk() }
            jsonPath("$.constitutions.length()") { value(0) }
        }
        mockMvc.get("/jurisdictions/$parentId") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.constitutions[0].id") { value(constitutionId.toString()) }
        }
        mockMvc.get("/versions/${version.id}").andExpect { status { isNotFound() } }
        mockMvc.post("/versions/${version.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect { status { isOk() } }
        mockMvc.get("/versions/${version.id}").andExpect {
            status { isOk() }
            jsonPath("$.jurisdictionId") { value(parentId) }
        }
        mockMvc.get("/jurisdictions/$parentId").andExpect {
            status { isOk() }
            jsonPath("$.constitutions[0].versions[0].id") { value(version.id.toString()) }
        }
        mockMvc.get("/countries/$code") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.constitutions.length()") { value(0) }
        }
        assertThat(catalogRepository.listCountries().single { it.id == country.id }.versionCount).isZero()
    }

    @Test
    fun constitutionSlugsAliasesAndSuccessionAreScopedToJurisdictions() {
        val country = writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(uniqueCountryCode(), "Scoped country"))
        val jurisdictions = listOf("first", "second").map { slug ->
            val response = mockMvc.post("/jurisdictions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"parentId":"${country.id}","slug":"$slug","name":"Same name","kind":"region"}"""
            }.andExpect { status { isCreated() } }.andReturn().response
            UUID.fromString(objectMapper.readTree(response.contentAsString)["id"].asText())
        }
        val constitutions = jurisdictions.map { jurisdiction ->
            writes.createJurisdictionConstitution(jurisdiction, com.constitutionatlas.catalog.api.CreateConstitutionRequest("charter", "Charter"))
        }
        val metadata = mockMvc.get("/constitutions/${constitutions.first().id}/metadata") { header("Authorization", TOKEN) }
            .andReturn().response
        val revision = objectMapper.readTree(metadata.contentAsString)["revisionId"].asText()
        mockMvc.put("/constitutions/${constitutions.first().id}/metadata") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevisionId":"$revision","title":"Renamed charter","slug":"renamed","retainSlugAlias":true}"""
        }.andExpect { status { isOk() } }
        assertThat(catalogRepository.findConstitutionId(jurisdictions.first(), "charter")).isEqualTo(constitutions.first().id)
        assertThat(catalogRepository.findConstitutionId(jurisdictions.last(), "charter")).isEqualTo(constitutions.last().id)
        mockMvc.post("/jurisdictions/${jurisdictions.first()}/constitutions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"charter","title":"Alias collision"}"""
        }.andExpect { status { isConflict() } }
        mockMvc.post("/jurisdictions/${jurisdictions.last()}/constitutions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"successor","title":"Successor","predecessorConstitutionId":"${constitutions.first().id}"}"""
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("invalid_constitution_predecessor") }
        }
        val successor = writes.createJurisdictionConstitution(
            jurisdictions.first(),
            com.constitutionatlas.catalog.api.CreateConstitutionRequest("successor", "Successor", predecessorConstitutionId = constitutions.first().id),
        )
        assertThat(successor.predecessorConstitutionId).isEqualTo(constitutions.first().id)
    }

    @Test
    fun jurisdictionCreationValidatesParentsCodesUniquenessAndAccess() {
        val slug = "root-${UUID.randomUUID()}"
        val payload = """{"slug":"$slug","name":"Root region","kind":"region"}"""
        listOf(null to 401, VIEWER_TOKEN to 403).forEach { (token, expectedStatus) ->
            mockMvc.post("/jurisdictions") {
                if (token != null) header("Authorization", token)
                contentType = MediaType.APPLICATION_JSON
                content = payload
            }.andExpect { status { isEqualTo(expectedStatus) } }
        }
        val rootResponse = mockMvc.post("/jurisdictions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = payload
        }.andExpect { status { isCreated() } }.andReturn().response
        val rootId = objectMapper.readTree(rootResponse.contentAsString)["id"].asText()
        mockMvc.get("/jurisdictions").andExpect {
            status { isOk() }
            jsonPath("$[*].id") { value(org.hamcrest.Matchers.hasItem(rootId)) }
        }
        mockMvc.post("/jurisdictions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = payload
        }.andExpect { status { isConflict() } }
        listOf("first" to 201, "second" to 409).forEach { (childSlug, expectedStatus) ->
            mockMvc.post("/jurisdictions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"parentId":"$rootId","slug":"$childSlug","name":"Child","kind":"region","code":"LOCAL"}"""
            }.andExpect { status { isEqualTo(expectedStatus) } }
        }
        listOf(
            """{"slug":"child","name":"Child","kind":"region","parentId":"${UUID.randomUUID()}"}""" to 404,
            """{"slug":"child","name":"Child","kind":"country","code":"XY","parentId":"$rootId"}""" to 400,
            """{"slug":"Invalid Slug","name":"Child","kind":"region"}""" to 400,
            """{"slug":"child","name":" ","kind":"region"}""" to 400,
            """{"slug":"child","name":"Child","kind":"region","code":""}""" to 400,
        ).forEach { (invalid, expectedStatus) ->
            mockMvc.post("/jurisdictions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = invalid
            }.andExpect { status { isEqualTo(expectedStatus) } }
        }
        val missing = UUID.randomUUID()
        mockMvc.get("/jurisdictions/$missing").andExpect { status { isNotFound() } }
        mockMvc.get("/jurisdictions?parentId=$missing").andExpect { status { isNotFound() } }
        mockMvc.post("/jurisdictions/$rootId/constitutions") {
            header("Authorization", VIEWER_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"charter","title":"Charter"}"""
        }.andExpect { status { isForbidden() } }
        mockMvc.post("/jurisdictions/$missing/constitutions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"charter","title":"Charter"}"""
        }.andExpect { status { isNotFound() } }
    }

    @Test
    fun countryJurisdictionsRetainExistingIdsAndLegacyApiBehavior() {
        val code = uniqueCountryCode()
        val response = mockMvc.post("/jurisdictions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"${code.lowercase()}","code":"$code","name":"Compatible country","kind":"country"}"""
        }.andExpect { status { isCreated() } }.andReturn().response
        val id = objectMapper.readTree(response.contentAsString)["id"].asText()
        mockMvc.get("/countries/$code").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(id) }
        }
        val constitution = writes.createConstitution(code, com.constitutionatlas.catalog.api.CreateConstitutionRequest("national", "National constitution"))
        mockMvc.get("/jurisdictions/$id") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.constitutions[0].id") { value(constitution.id.toString()) }
            jsonPath("$.ancestors.length()") { value(0) }
        }
        assertThat(jdbcTemplate.queryForObject("SELECT country_id = jurisdiction_id FROM constitutions WHERE id = ?", Boolean::class.java, constitution.id)).isEqualTo(true)
    }

    @Test
    fun jurisdictionMigrationPreservesExistingCountriesConstitutionsAndAliases() {
        val schema = "jurisdiction_upgrade_${UUID.randomUUID().toString().replace("-", "")}"
        val countryId = UUID.randomUUID()
        val constitutionId = UUID.randomUUID()
        val flyway = org.flywaydb.core.Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .schemas(schema).defaultSchema(schema)
        try {
            flyway.target("24").load().migrate()
            jdbcTemplate.update("INSERT INTO $schema.countries(id, iso_code, name) VALUES (?, 'XY', 'Existing country')", countryId)
            jdbcTemplate.update("INSERT INTO $schema.constitutions(id, country_id, slug, title) VALUES (?, ?, 'existing', 'Existing constitution')", constitutionId, countryId)
            jdbcTemplate.update("INSERT INTO $schema.constitution_slug_aliases(country_id, slug, constitution_id) VALUES (?, 'old-slug', ?)", countryId, constitutionId)
            flyway.target("25").load().migrate()
            flyway.target("latest").load().migrate()
            assertThat(jdbcTemplate.queryForObject("SELECT id FROM $schema.jurisdictions WHERE code = 'XY'", UUID::class.java)).isEqualTo(countryId)
            assertThat(jdbcTemplate.queryForObject("SELECT historical FROM $schema.jurisdictions WHERE id = ?", Boolean::class.java, countryId) == false).isTrue()
            assertThat(jdbcTemplate.queryForObject("SELECT jurisdiction_id FROM $schema.constitutions WHERE id = ?", UUID::class.java, constitutionId)).isEqualTo(countryId)
            assertThat(jdbcTemplate.queryForObject("SELECT constitution_id FROM $schema.constitution_slug_aliases WHERE jurisdiction_id = ? AND slug = 'old-slug'", UUID::class.java, countryId)).isEqualTo(constitutionId)
        } finally {
            jdbcTemplate.execute("DROP SCHEMA IF EXISTS $schema CASCADE")
        }
    }

    @Test
    fun importedDraftCannotBypassReviewWithOrdinaryPublisherCredential() {
        val countryCode = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Import hold country"))
        val constitution = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("import-hold", "Imported constitution"))
        val jobId = UUID.randomUUID()
        val version = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("1", importJobId = jobId))
        mockMvc.post("/versions/${version.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect { status { isForbidden() } }
        val importToken = "Bearer import-publisher-token"
        Mockito.`when`(identityClient.authenticate(importToken)).thenReturn(Actor(UUID.randomUUID(), "ingestion", emptyList(), listOf("ingestion:publish")))
        mockMvc.post("/versions/${version.id}/publish?importJobId=${UUID.randomUUID()}") { header("Authorization", importToken) }
            .andExpect { status { isForbidden() } }
        mockMvc.post("/versions/${version.id}/publish?importJobId=$jobId") { header("Authorization", importToken) }
            .andExpect { status { isOk() } }
    }

    @Test
    fun importSealingReservationRequiresTheHeldVersionAndExactAttempt() {
        val code = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(code, "Reservation fixture"))
        val constitution = writes.createConstitution(code, com.constitutionatlas.catalog.api.CreateConstitutionRequest("held", "Held import"))
        val attempt = UUID.randomUUID()
        val version = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("1", importJobId = attempt, publishAttemptId = attempt))
        val token = "Bearer reservation-publisher"
        Mockito.`when`(identityClient.authenticate(token)).thenReturn(Actor(UUID.randomUUID(), "ingestion", emptyList(), listOf("ingestion:publish")))
        mockMvc.get("/versions/${version.id}/import-reservation?attemptId=$attempt") { header("Authorization", token) }.andExpect { status { isOk() } }
        mockMvc.get("/versions/${version.id}/import-reservation?attemptId=${UUID.randomUUID()}") { header("Authorization", token) }.andExpect { status { isForbidden() } }
        mockMvc.get("/versions/${version.id}/import-reservation?attemptId=$attempt") { header("Authorization", TOKEN) }.andExpect { status { isForbidden() } }
        val ordinaryConstitution = writes.createConstitution(code, com.constitutionatlas.catalog.api.CreateConstitutionRequest("ordinary", "Ordinary draft"))
        val ordinary = writes.createDraftVersion(ordinaryConstitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("ordinary"))
        mockMvc.get("/versions/${ordinary.id}/import-reservation?attemptId=$attempt") { header("Authorization", token) }.andExpect { status { isForbidden() } }
    }

    @Test
    fun constitutionLifecycleTracksSuspensionRestorationAndRepeal() {
        val countryCode = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Lifecycle country"))
        val first = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("first", "First constitution"))
        val second = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("interim", "Interim constitution", predecessorConstitutionId = first.id, interim = true))
        assertThat(second.predecessorConstitutionId).isEqualTo(first.id)
        assertThat(second.interim).isTrue()
        val events = listOf(
            "adopted" to "2000-01-01",
            "commenced" to "2001-01-01",
            "suspended" to "2002-01-01",
            "restored" to "2003-01-01",
            "repealed" to "2004-01-01",
        )
        events.forEach { (kind, date) ->
            lifecycle.append(first.id, com.constitutionatlas.catalog.api.CreateLifecycleEvent(kind, java.time.LocalDate.parse(date)), publisher.id)
        }
        assertThat(lifecycle.events(first.id).map { it.eventType }).containsExactlyElementsOf(events.map { it.first })
        assertThat(lifecycle.countryEvents(countryCode).map { it.constitutionId }).containsOnly(first.id)
        assertThat(catalogRepository.lifecycleStatus(first.id)).isEqualTo("repealed")
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) {
            lifecycle.append(first.id, com.constitutionatlas.catalog.api.CreateLifecycleEvent("restored", java.time.LocalDate.parse("2005-01-01")), publisher.id)
        }
    }

    @Test
    fun lifecycleWritesRequirePublisherAndReadsArePublic() {
        val countryCode = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Timeline country"))
        val constitution = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("timeline", "Timeline constitution"))
        val path = "/constitutions/${constitution.id}/lifecycle-events"
        mockMvc.post(path) {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"eventType":"adopted","eventDate":"2000-01-01"}"""
        }.andExpect { status { isForbidden() } }
        mockMvc.post(path) {
            header("Authorization", PUBLISHER_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"eventType":"adopted","eventDate":"2000-01-01"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.eventType") { value("adopted") }
        }
        mockMvc.get("/countries/$countryCode/constitution-lifecycle").andExpect {
            status { isOk() }
            jsonPath("$[0].constitutionId") { value(constitution.id.toString()) }
        }
        mockMvc.get("/constitutions/${constitution.id}/lifecycle-status?on=1999-01-01").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("unknown") }
        }
        mockMvc.get("/constitutions/${constitution.id}/lifecycle-status?on=2000-01-02").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("awaiting_commencement") }
        }
    }

    @Test
    fun countryAndConstitutionWikiPagesPublishIndependentRevisions() {
        val countryCode = uniqueCountryCode()
        val country = writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Wiki country"))
        val constitution = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("wiki", "Wiki constitution"))
        val firstImage = com.constitutionatlas.catalog.api.WikiImage(UUID.randomUUID(), 2, "A historic flag", placement = "before_body")
        val countryDraft = wiki.save("country", country.id, com.constitutionatlas.catalog.api.SaveWikiPage(summary = "A country summary", body = "History", images = listOf(firstImage), sourceUrls = listOf("https://example.org/history")), editor.id)
        val constitutionDraft = wiki.save("constitution", constitution.id, com.constitutionatlas.catalog.api.SaveWikiPage(summary = "A constitution summary", body = "Origins"), editor.id)
        assertThat(wiki.published("country", country.id)).isNull()
        wiki.publish("country", country.id, countryDraft.id)
        wiki.publish("constitution", constitution.id, constitutionDraft.id)
        assertThat(wiki.published("country", country.id)?.summary).isEqualTo("A country summary")
        assertThat(wiki.published("country", country.id)?.sourceUrls).containsExactly("https://example.org/history")
        assertThat(wiki.published("constitution", constitution.id)?.summary).isEqualTo("A constitution summary")
        val nextDraft = wiki.save("country", country.id, com.constitutionatlas.catalog.api.SaveWikiPage(countryDraft.id, "Updated summary", "Updated history"), editor.id)
        assertThat(nextDraft.predecessorId).isEqualTo(countryDraft.id)
        assertThat(wiki.published("country", country.id)?.summary).isEqualTo("A country summary")
        assertThat(wiki.publishedRevision("country", country.id, nextDraft.id)).isNull()
        assertThat(wiki.history("country", country.id).map { it.id }).containsExactly(nextDraft.id, countryDraft.id)
        assertThat(wiki.history("country", country.id, limit = 1, offset = 1).single().id).isEqualTo(countryDraft.id)
        assertThat(wiki.history("country", country.id).first().publishedAt).isNull()
        wiki.publish("country", country.id, nextDraft.id)
        assertThat(wiki.publishedRevision("country", country.id, countryDraft.id)?.summary).isEqualTo("A country summary")
        assertThat(wiki.publishedRevision("country", country.id, countryDraft.id)?.images).containsExactly(firstImage)
        assertThat(wiki.publishedRevision("country", country.id, nextDraft.id)?.publishedAt).isNotNull()
        mockMvc.get("/wiki/country/${country.id}/revisions/${countryDraft.id}").andExpect {
            status { isOk() }
            jsonPath("$.summary") { value("A country summary") }
        }
        mockMvc.get("/wiki/country/${country.id}/history").andExpect { status { isUnauthorized() } }
        mockMvc.get("/wiki/country/${country.id}/history") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$[0].summary") { value("Updated summary") }
        }
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) {
            wiki.publish("country", country.id, countryDraft.id)
        }
    }

    @Test
    fun approximateLifecycleDateDoesNotClaimCertainStatus() {
        val countryCode = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Approximate date country"))
        val constitution = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("approximate", "Approximate constitution"))
        val adoption = lifecycle.append(
            constitution.id,
            com.constitutionatlas.catalog.api.CreateLifecycleEvent("adopted", java.time.LocalDate.parse("1900-01-01"), dateCertainty = "approximate"),
            publisher.id,
        )
        assertThat(adoption.dateCertainty).isEqualTo("approximate")
        assertThat(catalogRepository.lifecycleStatus(constitution.id, java.time.LocalDate.parse("1900-01-02"))).isEqualTo("uncertain")
        lifecycle.append(constitution.id, com.constitutionatlas.catalog.api.CreateLifecycleEvent("commenced", java.time.LocalDate.parse("1901-01-01")), publisher.id)
        assertThat(catalogRepository.lifecycleStatus(constitution.id, java.time.LocalDate.parse("1901-01-02"))).isEqualTo("in_force")
    }

    @Test
    fun wikiPublicationRequiresPinnedImages() {
        val countryCode = uniqueCountryCode()
        val country = writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Image country"))
        val image = com.constitutionatlas.catalog.api.WikiImage(UUID.randomUUID(), 1, "Map")
        val draft = wiki.save("country", country.id, com.constitutionatlas.catalog.api.SaveWikiPage(summary = "Summary", body = "History", images = listOf(image)), editor.id)
        Mockito.doThrow(com.constitutionatlas.catalog.ConflictException("Image not pinned")).`when`(wikiMedia)
            .requirePinnedImages("country", country.id, draft.id, listOf(image), PUBLISHER_TOKEN)
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) {
            wiki.publish("country", country.id, draft.id, PUBLISHER_TOKEN)
        }
        assertThat(wiki.published("country", country.id)).isNull()
    }

    @Test
    fun provisionsCanCommenceLaterAndBeSuspendedIndependently() {
        val countryCode = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Provision country"))
        val constitution = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("provisions", "Provision constitution"))
        val version = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("1"))
        writes.publishVersion(version.id)
        lifecycle.append(constitution.id, com.constitutionatlas.catalog.api.CreateLifecycleEvent("adopted", java.time.LocalDate.parse("2000-01-01")), publisher.id)
        lifecycle.append(constitution.id, com.constitutionatlas.catalog.api.CreateLifecycleEvent("commenced", java.time.LocalDate.parse("2001-01-01")), publisher.id)
        val unit = UUID.randomUUID()
        val deferred = provisionLifecycle.append(
            constitution.id,
            com.constitutionatlas.catalog.api.CreateProvisionLifecycleEvent(version.id, "deferred", java.time.LocalDate.parse("2000-06-01"), listOf(unit)),
            publisher.id,
        )
        assertThat(deferred.logicalUnitIds).containsExactly(unit)
        provisionLifecycle.append(
            constitution.id,
            com.constitutionatlas.catalog.api.CreateProvisionLifecycleEvent(version.id, "commenced", java.time.LocalDate.parse("2002-01-01"), listOf(unit)),
            publisher.id,
        )
        provisionLifecycle.append(
            constitution.id,
            com.constitutionatlas.catalog.api.CreateProvisionLifecycleEvent(version.id, "suspended", java.time.LocalDate.parse("2003-01-01"), listOf(unit)),
            publisher.id,
        )
        assertThat(catalogRepository.lifecycleStatus(constitution.id, java.time.LocalDate.parse("2003-06-01"))).isEqualTo("in_force")
        assertThat(provisionLifecycle.countryEvents(countryCode)).hasSize(3)
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) {
            provisionLifecycle.append(
                constitution.id,
                com.constitutionatlas.catalog.api.CreateProvisionLifecycleEvent(version.id, "commenced", java.time.LocalDate.parse("2004-01-01"), listOf(unit)),
                publisher.id,
            )
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = ["none", "current", "legacy", "inherited"])
    fun successorReservationRetriesRequireCompleteContentAndRejectChangedPayload(sourceFormat: String) {
        val countryCode = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Reservation country"))
        val constitution = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("reservation-${UUID.randomUUID()}", "Reservation test"))
        val evidence = if (sourceFormat == "none") null else com.constitutionatlas.platform.SourceEvidence(coverage = "Excerpt", attribution = "Archive")
        val initial = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("0", sourceEvidence = evidence.takeIf { sourceFormat == "inherited" }))
        writes.publishVersion(initial.id)
        val attempt = UUID.randomUUID()
        val request = com.constitutionatlas.catalog.api.CreateVersionRequest("1", predecessorVersionId = initial.id, hopKind = "editorial_correction", publicationComment = "Correction", publishAttemptId = attempt, sourceEvidence = evidence)
        val reserved = writes.createDraftVersion(constitution.id, if (sourceFormat == "inherited") request.copy(sourceEvidence = null) else request)
        if (sourceFormat == "legacy") {
            // Exact pre-description DTO bytes, independent of the current toString().
            val original = "CreateVersionRequest(versionLabel=1, effectiveDate=null, languageCode=en, sourceUrl=null, gazetteReference=null, predecessorVersionId=${initial.id}, hopKind=editorial_correction, publicationComment=Correction, structuralSettingsRevisionId=null, publishAttemptId=$attempt, importJobId=null, sourceEvidence=SourceEvidence(dateWording=null, datePrecision=unknown, coverage=Excerpt, statusWording=null, attribution=Archive))"
            val hash = java.security.MessageDigest.getInstance("SHA-256").digest(original.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
            jdbcTemplate.update("UPDATE successor_publish_attempts SET request_hash = ? WHERE id = ?", hash, attempt)
        }
        val pinnedHash = jdbcTemplate.queryForObject("SELECT request_hash FROM successor_publish_attempts WHERE id = ?", String::class.java, attempt)
        assertThat(writes.createDraftVersion(constitution.id, request).id).isEqualTo(reserved.id)
        assertThat(writes.publishAttempt(attempt).id).isEqualTo(reserved.id)
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) { writes.createDraftVersion(constitution.id, request.copy(publicationComment = "Changed request")) }
        if (evidence != null) {
            org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) { writes.createDraftVersion(constitution.id, request.copy(sourceEvidence = evidence.copy(attribution = "Changed archive"))) }
            org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) { writes.createDraftVersion(constitution.id, request.copy(sourceEvidence = evidence.copy(description = "New description"))) }
        }
        val settings = settingsRepository.forVersion(reserved.id).id
        Mockito.doThrow(com.constitutionatlas.catalog.ConflictException("Incomplete roots")).`when`(readiness).requireReady(reserved.id, attempt, settings)
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) { writes.publishVersion(reserved.id) }
        assertThat(catalogRepository.findVersion(reserved.id)!!.publicationStatus).isEqualTo("draft")
        Mockito.doNothing().`when`(readiness).requireReady(reserved.id, attempt, settings)
        assertThat(writes.publishVersion(reserved.id).publicationStatus).isEqualTo("published")
        assertThat(writes.createDraftVersion(constitution.id, request).id).isEqualTo(reserved.id)
        assertThat(jdbcTemplate.queryForObject("SELECT request_hash FROM successor_publish_attempts WHERE id = ?", String::class.java, attempt)).isEqualTo(pinnedHash)
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) { writes.createDraftVersion(constitution.id, request.copy(versionLabel = "concurrent", publishAttemptId = UUID.randomUUID())) }
    }

    @BeforeEach
    fun stubIdentity() {
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000002")
        if (settingsRepository.currentId(constitutionId) == null) {
            settingsRepository.append(constitutionId, catalogRepository.findOutline(constitutionId))
            catalogRepository.listAllVersionIds(constitutionId).forEach {
                settingsRepository.pin(it, constitutionId, null)
            }
        }
        Mockito.reset(identityClient, wikiMedia, provisionScope)
        Mockito.`when`(settingsUsage.inspect(Mockito.anyList(), Mockito.anyList(), Mockito.any())).thenAnswer { invocation ->
            val kinds = invocation.getArgument<List<com.constitutionatlas.catalog.api.OutlineKindWrite>>(1)
            if (kinds.size == 2) {
                com.constitutionatlas.catalog.api.SettingsUsage(violations = listOf(com.constitutionatlas.catalog.api.SettingsViolation(UUID.fromString("01900000-0000-4000-8000-000000000003"), null, "kind", "Occupied sentence level")))
            } else {
                com.constitutionatlas.catalog.api.SettingsUsage()
            }
        }
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(editor)
        Mockito.`when`(identityClient.authenticate(PUBLISHER_TOKEN)).thenReturn(publisher)
        Mockito.`when`(identityClient.authenticate(VIEWER_TOKEN)).thenReturn(viewer)
    }

    @Test
    fun listCountriesIncludesGermany() {
        mockMvc.get("/countries")
            .andExpect {
                status { isOk() }
                jsonPath("$[*].isoCode") { value(org.hamcrest.Matchers.hasItem("DE")) }
                jsonPath("$[?(@.isoCode=='DE')].latestVersionLabel") { value(org.hamcrest.Matchers.hasItem("2022")) }
                jsonPath("$[?(@.isoCode=='DE')].latestEffectiveDate") { value(org.hamcrest.Matchers.hasItem("2022-12-19")) }
                jsonPath("$[?(@.isoCode=='DE')].versionCount") { value(org.hamcrest.Matchers.hasItem(2)) }
            }
    }

    @Test
    fun getCountryOmitsDraftVersions() {
        mockMvc.get("/countries/DE")
            .andExpect {
                status { isOk() }
                jsonPath("$.constitutions[0].slug") { value("basic-law") }
                jsonPath("$.constitutions[0].versions.length()") { value(2) }
                jsonPath("$.constitutions[0].versions[0].versionLabel") { value("1949") }
                jsonPath("$.constitutions[0].versions[0].provenance") { value("demo") }
                jsonPath("$.constitutions[0].versions[0].verificationState") { value("unverified") }
                jsonPath("$.constitutions[0].versions[0].latestPublished") { value(false) }
                jsonPath("$.constitutions[0].versions[1].versionLabel") { value("2022") }
                jsonPath("$.constitutions[0].versions[1].provenance") { value("demo") }
                jsonPath("$.constitutions[0].versions[1].latestPublished") { value(true) }
                jsonPath("$.constitutions[0].contentOutline.kinds.length()") { value(3) }
                jsonPath("$.constitutions[0].contentOutline.kinds[0].kindCode") { value("article") }
                jsonPath("$.constitutions[0].contentOutline.kinds[0].allowedChildKinds[0]") { value("paragraph") }
            }
    }

    @Test
    fun germanyOutlineIsArticleParagraphSentence() {
        mockMvc.get("/constitutions/01900000-0000-4000-8000-000000000002/content-outline")
            .andExpect {
                status { isOk() }
                jsonPath("$.kinds[1].kindCode") { value("paragraph") }
                jsonPath("$.kinds[2].kindCode") { value("sentence") }
                jsonPath("$.kinds[2].mayHoldChildren") { value(false) }
                jsonPath("$.kinds[0].presentation") { value("section") }
                jsonPath("$.kinds[0].showKind") { value(true) }
                jsonPath("$.kinds[1].showLabel") { value(true) }
                jsonPath("$.kinds[1].showTitle") { value(false) }
                jsonPath("$.kinds[1].showKind") { value(false) }
                jsonPath("$.kinds[2].presentation") { value("concatenated") }
            }
    }

    @Test
    fun mixedRootsAndOptionalPathsRoundTripThroughCatalog() {
        val country = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(country, "Mixed outline country"))
        val kinds = listOf(
            com.constitutionatlas.catalog.api.OutlineKindWrite("article", "Article", root = true, allowedChildKinds = listOf("paragraph")),
            com.constitutionatlas.catalog.api.OutlineKindWrite("paragraph", "Paragraph", allowedChildKinds = emptyList()),
            com.constitutionatlas.catalog.api.OutlineKindWrite("preamble", "Preamble", root = true, allowedChildKinds = emptyList(), showLabel = false),
            com.constitutionatlas.catalog.api.OutlineKindWrite("appendix", "Appendix", root = true, allowedChildKinds = listOf("item")),
            com.constitutionatlas.catalog.api.OutlineKindWrite("item", "Item", allowedChildKinds = emptyList()),
        )
        val constitution = writes.createConstitution(country, com.constitutionatlas.catalog.api.CreateConstitutionRequest("mixed", "Mixed", kinds))
        val stored = catalogRepository.findOutline(constitution.id).kinds.associateBy { it.kindCode }
        assertThat(stored.filterValues { it.root }.keys).containsExactlyInAnyOrder("article", "preamble", "appendix")
        assertThat(stored.getValue("article").allowedChildKinds).containsExactly("paragraph")
        assertThat(stored.getValue("appendix").allowedChildKinds).containsExactly("item")
        assertThat(stored.getValue("preamble").mayHoldText).isTrue()
    }

    @Test
    fun occupiedHierarchyChangesRequireMigration() {
        mockMvc.put("/constitutions/01900000-0000-4000-8000-000000000002/content-outline") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {"kinds":[
                  {"kindCode":"article","displayLabel":"Article","presentation":"section","showLabel":true,"showTitle":true,"showKind":true,"allowTextAlongsideChildren":true},
                  {"kindCode":"paragraph","displayLabel":"Paragraph","presentation":"section","showLabel":true,"showTitle":false,"showKind":false}
                ]}
            """.trimIndent()
        }.andExpect {
            status { isConflict() }
        }
        mockMvc.put("/constitutions/01900000-0000-4000-8000-000000000002/content-outline") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {"kinds":[
                  {"kindCode":"article","displayLabel":"Article","presentation":"section","showLabel":true,"showTitle":true,"showKind":true,"allowTextAlongsideChildren":true},
                  {"kindCode":"paragraph","displayLabel":"Paragraph","presentation":"section","showLabel":true,"showTitle":false,"showKind":false,"allowTextAlongsideChildren":true},
                  {"kindCode":"sentence","displayLabel":"Sentence","presentation":"concatenated","showLabel":false,"showTitle":false,"showKind":false,"segmentation":"sentence"}
                ]}
            """.trimIndent()
        }.andExpect { status { isOk() } }
    }

    @Test
    fun settingsPinsSurvivePresentationChangesAndRejectStaleSaves() {
        mockMvc.post("/countries") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"XY","name":"Settings test"}"""
        }.andExpect { status { isCreated() } }
        val created = mockMvc.post("/countries/XY/constitutions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"settings-test","title":"Settings test"}"""
        }.andExpect { status { isCreated() } }.andReturn()
        val constitutionId = objectMapper.readTree(created.response.contentAsString).get("id").asText()
        val initial = mockMvc.get("/constitutions/$constitutionId/settings") { header("Authorization", TOKEN) }.andReturn()
        val revisionId = objectMapper.readTree(initial.response.contentAsString).get("id").asText()
        val version = mockMvc.post("/constitutions/$constitutionId/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionLabel":"Initial"}"""
        }.andExpect { status { isCreated() } }.andReturn()
        val versionId = objectMapper.readTree(version.response.contentAsString).get("id").asText()
        val request = """{"expectedRevisionId":"$revisionId","kinds":[{"kindCode":"article","displayLabel":"Provision","showTitle":true}]}"""
        mockMvc.put("/constitutions/$constitutionId/settings") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = request
        }.andExpect {
            status { isOk() }
            jsonPath("$.predecessorId") { value(revisionId) }
        }
        mockMvc.get("/versions/$versionId/settings") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(revisionId) }
            jsonPath("$.outline.kinds[0].displayLabel") { value("Article") }
        }
        mockMvc.get("/versions/$versionId/reader-settings") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.kinds[0].displayLabel") { value("Provision") }
        }
        mockMvc.put("/constitutions/$constitutionId/settings") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = request
        }.andExpect { status { isConflict() } }
        val current = objectMapper.readTree(mockMvc.get("/constitutions/$constitutionId/settings") { header("Authorization", TOKEN) }.andReturn().response.contentAsString).get("id").asText()
        val restored = mockMvc.post("/constitutions/$constitutionId/settings/$revisionId/restore") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevisionId":"$current"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.predecessorId") { value(current) }
            jsonPath("$.outline.kinds[0].displayLabel") { value("Article") }
        }.andReturn()
        assertThat(objectMapper.readTree(restored.response.contentAsString).get("id").asText()).isNotEqualTo(revisionId)
        mockMvc.get("/versions/$versionId/reader-settings") { header("Authorization", TOKEN) }.andExpect { jsonPath("$.kinds[0].displayLabel") { value("Article") } }
        mockMvc.get("/versions/$versionId/settings") { header("Authorization", TOKEN) }.andExpect { jsonPath("$.id") { value(revisionId) } }
    }

    @Test
    fun repeatedOutlineImportKeepsCurrentRevisionDespiteGrandfatheredContent() {
        val id = "01900000-0000-4000-8000-000000000002"
        val initial = objectMapper.readTree(mockMvc.get("/constitutions/$id/settings") { header("Authorization", TOKEN) }.andReturn().response.contentAsString)
        val kinds = initial.path("outline").path("kinds")
        Mockito.`when`(settingsUsage.inspect(Mockito.anyList(), Mockito.anyList(), Mockito.any())).thenReturn(
            com.constitutionatlas.catalog.api.SettingsUsage(violations = listOf(com.constitutionatlas.catalog.api.SettingsViolation(UUID.randomUUID(), null, "content", "Grandfathered parent text"))),
        )
        mockMvc.post("/constitutions/$id/settings/preflight") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"kinds":$kinds}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.classification") { value("safely_reversible") }
            jsonPath("$.violations.length()") { value(0) }
        }
        mockMvc.put("/constitutions/$id/content-outline") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"kinds":$kinds}"""
        }.andExpect { status { isOk() } }
        mockMvc.get("/constitutions/$id/settings") { header("Authorization", TOKEN) }.andExpect { jsonPath("$.id") { value(initial.path("id").asText()) } }
        val displayKinds = kinds.deepCopy()
        (displayKinds[0] as tools.jackson.databind.node.ObjectNode).put("displayLabel", "Grandfathered provision")
        mockMvc.put("/constitutions/$id/settings") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevisionId":"${initial.path("id").asText()}","kinds":$displayKinds}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.outline.kinds[0].displayLabel") { value("Grandfathered provision") }
        }
        val updated = objectMapper.readTree(mockMvc.get("/constitutions/$id/settings") { header("Authorization", TOKEN) }.andReturn().response.contentAsString)
        mockMvc.post("/constitutions/$id/settings/${initial.path("id").asText()}/restore") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevisionId":"${updated.path("id").asText()}"}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun metadataChangesRetainSlugAliasesAndRejectCreationOnlyFields() {
        mockMvc.post("/countries") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"XR","name":"Metadata test"}"""
        }.andExpect { status { isCreated() } }
        val created = mockMvc.post("/countries/XR/constitutions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"original-name","title":"Original title"}"""
        }.andExpect { status { isCreated() } }.andReturn()
        val id = objectMapper.readTree(created.response.contentAsString).get("id").asText()
        val metadata = mockMvc.get("/constitutions/$id/metadata").andReturn()
        val revision = objectMapper.readTree(metadata.response.contentAsString).get("revisionId").asText()
        mockMvc.put("/constitutions/$id/metadata") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevisionId":"$revision","title":"Corrected title","slug":"corrected-name"}"""
        }.andExpect { status { isConflict() } }
        mockMvc.put("/constitutions/$id/metadata") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevisionId":"$revision","title":"Corrected title","slug":"corrected-name","retainSlugAlias":true}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.predecessorId") { value(revision) }
        }
        val countryId = catalogRepository.findCountrySummary("XR")!!.id
        assertThat(catalogRepository.findConstitutionId(countryId, "original-name")).isEqualTo(UUID.fromString(id))
        assertThat(catalogRepository.findConstitutionId(countryId, "corrected-name")).isEqualTo(UUID.fromString(id))
        mockMvc.put("/constitutions/$id/metadata") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevisionId":"$revision","title":"Relocated","slug":"relocated","countryId":"${UUID.randomUUID()}"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun unknownCountryReturns404() {
        mockMvc.get("/countries/ZZ").andExpect { status { isNotFound() } }
    }

    @Test
    fun unknownConstitutionReturns404() {
        mockMvc.get("/constitutions/${UUID.fromString("00000000-0000-4000-8000-000000000099")}/versions")
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun getPublishedVersionById() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004")
            .andExpect {
                status { isOk() }
                jsonPath("$.id") { value("01900000-0000-4000-8000-000000000004") }
                jsonPath("$.constitutionId") { value("01900000-0000-4000-8000-000000000002") }
                jsonPath("$.versionLabel") { value("2022") }
                jsonPath("$.publicationStatus") { value("published") }
                jsonPath("$.effectiveDate") { value("2022-12-19") }
                jsonPath("$.hopKind") { value("legal") }
                jsonPath("$.listing") { value("public") }
                jsonPath("$.predecessorVersionId") { value("01900000-0000-4000-8000-000000000003") }
            }
    }

    @Test
    fun getDraftVersionByIdWhenCallerIsAllowed() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000005") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.versionLabel") { value("draft-internal") }
            jsonPath("$.publicationStatus") { value("draft") }
        }
        mockMvc.get("/countries/DE")
            .andExpect {
                status { isOk() }
                jsonPath("$.constitutions[0].versions.length()") { value(2) }
            }
    }

    @Test
    fun unknownVersionByIdReturns404() {
        mockMvc.get("/versions/${UUID.fromString("00000000-0000-4000-8000-000000000099")}")
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun createCountryAndDraftVersionThenPublish() {
        mockMvc.post("/countries") {
            contentType = MediaType.APPLICATION_JSON
            header("Authorization", TOKEN)
            content = """{"isoCode":"fr","name":"France"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.isoCode") { value("FR") }
        }

        val constitutionId = mockMvc.post("/countries/FR/constitutions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"slug":"1958","title":"Constitution of 1958"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.slug") { value("1958") }
            jsonPath("$.contentOutline.kinds.length()") { value(1) }
            jsonPath("$.contentOutline.kinds[0].kindCode") { value("article") }
        }.andReturn().response.contentAsString.let {
            Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
        }

        mockMvc.get("/countries/FR") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.constitutions[0].versions.length()") { value(0) }
        }

        val versionId = mockMvc.post("/constitutions/$constitutionId/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionLabel":"1958","effectiveDate":"1958-10-04"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.publicationStatus") { value("draft") }
        }.andReturn().response.contentAsString.let {
            Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
        }

        mockMvc.get("/countries/FR").andExpect { jsonPath("$.constitutions.length()") { value(0) } }
        mockMvc.get("/constitutions/$constitutionId/settings").andExpect { status { isNotFound() } }
        mockMvc.get("/constitutions/$constitutionId/content-outline").andExpect { status { isNotFound() } }
        mockMvc.get("/versions/$versionId").andExpect { status { isNotFound() } }

        mockMvc.post("/versions/$versionId/publish") {
            header("Authorization", TOKEN)
        }.andExpect { status { isForbidden() } }

        mockMvc.post("/versions/$versionId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.publicationStatus") { value("published") }
        }

        mockMvc.get("/countries/FR").andExpect {
            status { isOk() }
            jsonPath("$.constitutions[0].versions[0].versionLabel") { value("1958") }
            jsonPath("$.constitutions[0].versions[0].provenance") { value("imported") }
            jsonPath("$.constitutions[0].versions[0].verificationState") { value("unverified") }
            jsonPath("$.constitutions[0].versions[0].latestPublished") { value(true) }
        }
    }

    @Test
    fun draftVersionWithCitationsWritesSourceRow() {
        mockMvc.post("/countries") {
            contentType = MediaType.APPLICATION_JSON
            header("Authorization", TOKEN)
            content = """{"isoCode":"us","name":"United States"}"""
        }.andExpect { status { isCreated() } }
        val constitutionId =
            mockMvc.post("/countries/US/constitutions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"slug":"constitution","title":"Constitution of the United States"}"""
            }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
                .let { Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1] }
        val versionId =
            mockMvc.post("/constitutions/$constitutionId/versions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """
                    {
                      "versionLabel":"1789",
                      "languageCode":"en",
                      "sourceUrl":"https://www.archives.gov/founding-docs/constitution-transcript",
                      "gazetteReference":"U.S. Const."
                    }
                """.trimIndent()
            }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
                .let { Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1] }
        val count =
            jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM constitution_sources
                WHERE constitution_version_id = ?::uuid
                  AND source_url = ?
                  AND gazette_reference = ?
                """.trimIndent(),
                Int::class.java,
                versionId,
                "https://www.archives.gov/founding-docs/constitution-transcript",
                "U.S. Const.",
            )
        assertThat(count).isEqualTo(1)
    }

    @Test
    fun countryListMatchesGatewayContract() {
        val json = mockMvc.get("/countries").andReturn().response.contentAsString
        val countries = objectMapper.readTree(json)
        val germany = countries.first { it.get("isoCode").asText() == "DE" }
        assertThat(germany).isEqualTo(gatewayContract("catalog-countries.json").get(0))
    }

    @Test
    fun countryDetailMatchesGatewayContract() {
        val json = mockMvc.get("/countries/DE").andReturn().response.contentAsString
        assertJsonEquals("catalog-country-DE.json", json)
    }

    @Test
    fun echoesProvidedCorrelationId() {
        mockMvc.get("/countries") {
            header(CorrelationIdFilter.HEADER, "test-corr-1")
        }.andExpect {
            status { isOk() }
            header { string(CorrelationIdFilter.HEADER, "test-corr-1") }
        }
    }

    @Test
    fun generatesCorrelationIdWhenMissing() {
        mockMvc.get("/countries").andExpect {
            status { isOk() }
            header { exists(CorrelationIdFilter.HEADER) }
        }
    }

    @Test
    fun actuatorInfoExposesBuild() {
        mockMvc.get("/actuator/info").andExpect {
            status { isOk() }
            jsonPath("$.build.artifact") { value("catalog-service") }
        }
    }

    @Test
    fun mutatingWritesRequireIdentityBearer() {
        mockMvc.post("/countries") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"xx","name":"Example"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun viewerCannotWriteCatalog() {
        mockMvc.post("/countries") {
            header("Authorization", VIEWER_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"xx","name":"Example"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun secondSuccessorOfSamePredecessorReturnsNotTip() {
        mockMvc.post("/countries") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"ch","name":"Chain Test"}"""
        }.andExpect { status { isCreated() } }

        val constitutionId =
            mockMvc.post("/countries/CH/constitutions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"slug":"test","title":"Chain Test Constitution"}"""
            }.andExpect { status { isCreated() } }
                .andReturn().response.contentAsString.let {
                    Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
                }

        val rootId =
            mockMvc.post("/constitutions/$constitutionId/versions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"versionLabel":"v1","effectiveDate":"2000-01-01"}"""
            }.andExpect { status { isCreated() } }
                .andReturn().response.contentAsString.let {
                    Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
                }

        mockMvc.post("/versions/$rootId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.post("/constitutions/$constitutionId/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "versionLabel":"v2-a",
                  "predecessorVersionId":"$rootId",
                  "hopKind":"legal_amendment"
                }
            """.trimIndent()
        }.andExpect { status { isCreated() } }

        mockMvc.post("/constitutions/$constitutionId/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "versionLabel":"v2-b",
                  "predecessorVersionId":"$rootId",
                  "hopKind":"legal_amendment"
                }
            """.trimIndent()
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("not_legal_tip") }
        }
    }

    @Test
    fun unknownPredecessorReturnsUnknownPredecessor() {
        val constitutionId = "01900000-0000-4000-8000-000000000002"
        val unknownPredecessor = "00000000-0000-4000-8000-000000000099"
        mockMvc.post("/constitutions/$constitutionId/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "versionLabel":"orphan",
                  "predecessorVersionId":"$unknownPredecessor",
                  "hopKind":"legal_amendment"
                }
            """.trimIndent()
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("unknown_predecessor") }
        }
    }

    @Test
    fun hopKindRequiredWhenPredecessorSet() {
        val constitutionId = "01900000-0000-4000-8000-000000000002"
        val predecessorId = "01900000-0000-4000-8000-000000000004"
        mockMvc.post("/constitutions/$constitutionId/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "versionLabel":"missing-hop",
                  "predecessorVersionId":"$predecessorId"
                }
            """.trimIndent()
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun existingChainRequiresPredecessor() {
        mockMvc.post("/constitutions/01900000-0000-4000-8000-000000000002/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionLabel":"orphan-root"}"""
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("not_legal_tip") }
        }
    }

    @Test
    fun editorialCorrectionHiddenFromPublicListButReadableAndTipsCountry() {
        mockMvc.post("/countries") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"at","name":"Austria"}"""
        }.andExpect { status { isCreated() } }

        val constitutionId =
            mockMvc.post("/countries/AT/constitutions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"slug":"federal","title":"Federal Constitutional Law"}"""
            }.andExpect { status { isCreated() } }
                .andReturn().response.contentAsString.let {
                    Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
                }

        val rootId =
            mockMvc.post("/constitutions/$constitutionId/versions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"versionLabel":"1920","effectiveDate":"1920-10-01"}"""
            }.andExpect { status { isCreated() } }
                .andReturn().response.contentAsString.let {
                    Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
                }

        mockMvc.post("/versions/$rootId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        val publicTipId =
            mockMvc.post("/constitutions/$constitutionId/versions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """
                    {
                      "versionLabel":"2020",
                      "effectiveDate":"2020-01-01",
                      "predecessorVersionId":"$rootId",
                      "hopKind":"legal_amendment"
                    }
                """.trimIndent()
            }.andExpect { status { isCreated() } }
                .andReturn().response.contentAsString.let {
                    Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
                }

        mockMvc.post("/versions/$publicTipId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        val editorialLabel = "2023-editorial"
        val versionId =
            mockMvc.post("/constitutions/$constitutionId/versions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """
                    {
                      "versionLabel":"$editorialLabel",
                      "effectiveDate":"2023-01-01",
                      "predecessorVersionId":"$publicTipId",
                      "hopKind":"editorial_correction"
                    }
                """.trimIndent()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.hopKind") { value("editorial_correction") }
                jsonPath("$.listing") { value("staff") }
            }.andReturn().response.contentAsString.let {
                Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
            }

        mockMvc.post("/versions/$versionId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        // The public version summary points at this published editorial tip.
        mockMvc.get("/versions/$versionId").andExpect { status { isOk() } }

        mockMvc.get("/constitutions/$constitutionId/versions")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(2) }
                jsonPath("$[*].versionLabel") {
                    value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem(editorialLabel)))
                }
                jsonPath("$[?(@.versionLabel=='2020')].latestPublished") { value(true) }
                jsonPath("$[?(@.versionLabel=='2020')].currentVersionId") { value(org.hamcrest.Matchers.hasItem(versionId)) }
            }

        mockMvc.get("/constitutions/$constitutionId/versions?listing=all")
            .andExpect { status { isUnauthorized() } }

        mockMvc.get("/constitutions/$constitutionId/versions?listing=all") {
            header("Authorization", VIEWER_TOKEN)
        }.andExpect { status { isForbidden() } }

        mockMvc.get("/constitutions/$constitutionId/versions?listing=all") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(3) }
            jsonPath("$[2].versionLabel") { value(editorialLabel) }
            jsonPath("$[2].listing") { value("staff") }
            jsonPath("$[2].latestPublished") { value(true) }
        }

        mockMvc.get("/versions/$versionId") { header("Authorization", TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.versionLabel") { value(editorialLabel) }
                jsonPath("$.listing") { value("staff") }
            }

        mockMvc.get("/countries")
            .andExpect {
                status { isOk() }
                jsonPath("$[?(@.isoCode=='AT')].latestVersionLabel") {
                    value(org.hamcrest.Matchers.hasItem("2020"))
                }
                jsonPath("$[?(@.isoCode=='AT')].latestVersionId") { value(org.hamcrest.Matchers.hasItem(versionId)) }
                jsonPath("$[?(@.isoCode=='AT')].versionCount") { value(org.hamcrest.Matchers.hasItem(2)) }
            }
    }

    @Test
    fun publishedEditorialPermalinksRemainReadableAfterFurtherCorrections() {
        val countryCode = uniqueCountryCode()
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest(countryCode, "Permalink country"))
        val constitution = writes.createConstitution(countryCode, com.constitutionatlas.catalog.api.CreateConstitutionRequest("permalinks", "Published history"))
        val initial = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("2000"))
        writes.publishVersion(initial.id)

        fun correction(predecessorId: UUID, label: String) = writes.createDraftVersion(
            constitution.id,
            com.constitutionatlas.catalog.api.CreateVersionRequest(label, predecessorVersionId = predecessorId, hopKind = "editorial_correction"),
        )

        val first = correction(initial.id, "2000-r2")
        mockMvc.post("/versions/${first.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect { status { isOk() } }
        mockMvc.get("/versions/${first.id}").andExpect {
            status { isOk() }
            jsonPath("$.currentVersionId") { value(first.id.toString()) }
        }

        val second = correction(first.id, "2000-r3")
        mockMvc.post("/versions/${second.id}/publish") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect { status { isOk() } }
        val draft = correction(second.id, "2000-r4-draft")

        listOf<String?>(null, VIEWER_TOKEN).forEach { authorization ->
            listOf(initial, first, second).forEach { snapshot ->
                mockMvc.get("/versions/${snapshot.id}") {
                    authorization?.let { header("Authorization", it) }
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.id") { value(snapshot.id.toString()) }
                    jsonPath("$.versionLabel") { value(snapshot.versionLabel) }
                    jsonPath("$.publicationStatus") { value("published") }
                    jsonPath("$.listing") { value(if (snapshot.id == initial.id) "public" else "staff") }
                    jsonPath("$.currentVersionId") { value(second.id.toString()) }
                }
                listOf("settings", "reader-settings").forEach { resource ->
                    mockMvc.get("/versions/${snapshot.id}/$resource") {
                        authorization?.let { header("Authorization", it) }
                    }.andExpect { status { isOk() } }
                }
            }
            listOf("", "/settings", "/reader-settings").forEach { suffix ->
                mockMvc.get("/versions/${draft.id}$suffix") {
                    authorization?.let { header("Authorization", it) }
                }.andExpect { status { isNotFound() } }
            }
        }
        mockMvc.get("/versions/${draft.id}") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.publicationStatus") { value("draft") }
        }

        mockMvc.get("/constitutions/${constitution.id}/versions").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(second.id.toString()) }
            jsonPath("$[0].legalVersionId") { value(initial.id.toString()) }
            jsonPath("$[0].versionLabel") { value("2000") }
            jsonPath("$[0].currentVersionId") { value(second.id.toString()) }
        }
        mockMvc.get("/countries/$countryCode").andExpect {
            status { isOk() }
            jsonPath("$.constitutions[0].versions.length()") { value(1) }
            jsonPath("$.constitutions[0].latestVersionId") { value(second.id.toString()) }
        }
        mockMvc.get("/constitutions/${constitution.id}/versions?listing=all")
            .andExpect { status { isUnauthorized() } }
        mockMvc.get("/constitutions/${constitution.id}/versions?listing=all") { header("Authorization", VIEWER_TOKEN) }
            .andExpect { status { isForbidden() } }
    }

    @Test
    fun editorialHopOnOlderLawAfterLaterLegalExists() {
        val countryCode = uniqueCountryCode()
        mockMvc.post("/countries") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"$countryCode","name":"Belgium"}"""
        }.andExpect { status { isCreated() } }

        val constitutionId =
            mockMvc.post("/countries/$countryCode/constitutions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"slug":"constitution","title":"Belgian Constitution"}"""
            }.andExpect { status { isCreated() } }
                .andReturn().response.contentAsString.let {
                    Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
                }

        val law1949 =
            mockMvc.post("/constitutions/$constitutionId/versions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"versionLabel":"1949","effectiveDate":"1949-01-01"}"""
            }.andExpect { status { isCreated() } }
                .andReturn().response.contentAsString.let {
                    Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
                }
        mockMvc.post("/versions/$law1949/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        val law2022 =
            mockMvc.post("/constitutions/$constitutionId/versions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """
                    {
                      "versionLabel":"2022",
                      "effectiveDate":"2022-01-01",
                      "predecessorVersionId":"$law1949",
                      "hopKind":"legal"
                    }
                """.trimIndent()
            }.andExpect { status { isCreated() } }
                .andReturn().response.contentAsString.let {
                    Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
                }
        mockMvc.post("/versions/$law2022/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        val editorialId =
            mockMvc.post("/constitutions/$constitutionId/versions") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = """
                    {
                      "versionLabel":"1949-typo",
                      "effectiveDate":"2024-01-01",
                      "predecessorVersionId":"$law1949",
                      "hopKind":"editorial_correction"
                    }
                """.trimIndent()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.hopKind") { value("editorial_correction") }
                jsonPath("$.listing") { value("staff") }
                jsonPath("$.legalVersionId") { value(law1949) }
            }.andReturn().response.contentAsString.let {
                Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
            }

        mockMvc.post("/versions/$editorialId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.get("/constitutions/$constitutionId/versions")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(2) }
                jsonPath("$[?(@.versionLabel=='1949')].currentVersionId") {
                    value(org.hamcrest.Matchers.hasItem(editorialId))
                }
                jsonPath("$[*].versionLabel") {
                    value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("1949-typo")))
                }
            }

        mockMvc.post("/constitutions/$constitutionId/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "versionLabel":"1949-typo-2",
                  "predecessorVersionId":"$law1949",
                  "hopKind":"editorial_correction"
                }
            """.trimIndent()
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("not_editorial_tip") }
        }

        mockMvc.post("/constitutions/$constitutionId/versions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "versionLabel":"2025",
                  "predecessorVersionId":"$law1949",
                  "hopKind":"legal"
                }
            """.trimIndent()
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("not_legal_tip") }
        }

        mockMvc.get("/versions/$law1949")
            .andExpect {
                status { isOk() }
                jsonPath("$.currentVersionId") { value(editorialId) }
            }

        mockMvc.get("/countries/$countryCode")
            .andExpect {
                status { isOk() }
                jsonPath("$.constitutions[0].versions.length()") { value(2) }
                jsonPath("$.constitutions[0].latestVersionId") { value(law2022) }
            }

        val nextCorrection = writes.createDraftVersion(
            UUID.fromString(constitutionId),
            com.constitutionatlas.catalog.api.CreateVersionRequest(
                versionLabel = "1949-second-correction",
                predecessorVersionId = UUID.fromString(editorialId),
                hopKind = "editorial_correction",
            ),
        )
        mockMvc.get("/versions/${nextCorrection.id}").andExpect { status { isNotFound() } }
        mockMvc.get("/versions/${nextCorrection.id}/reader-settings").andExpect { status { isNotFound() } }
        mockMvc.post("/versions/${nextCorrection.id}/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        // A newer correction must not break an older published snapshot or its pinned layout.
        mockMvc.get("/versions/$editorialId").andExpect {
            status { isOk() }
            jsonPath("$.listing") { value("staff") }
            jsonPath("$.currentVersionId") { value(nextCorrection.id.toString()) }
        }
        mockMvc.get("/versions/$editorialId/reader-settings").andExpect { status { isOk() } }
        mockMvc.get("/versions/$editorialId/settings").andExpect { status { isOk() } }
        mockMvc.get("/constitutions/$constitutionId/versions").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[?(@.versionLabel=='1949')].currentVersionId") {
                value(org.hamcrest.Matchers.hasItem(nextCorrection.id.toString()))
            }
        }
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private const val PUBLISHER_TOKEN = "Bearer publisher-token"
        private const val VIEWER_TOKEN = "Bearer viewer-token"
        private val objectMapper = JsonMapper()

        private fun gatewayContract(contractFile: String): JsonNode =
            objectMapper.readTree(File("../../apps/gateway-web/lib/contracts/$contractFile"))

        private fun assertJsonEquals(contractFile: String, actualJson: String) {
            val expected: JsonNode = gatewayContract(contractFile)
            val actual: JsonNode = objectMapper.readTree(actualJson)
            assertThat(actual).isEqualTo(expected)
        }

        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

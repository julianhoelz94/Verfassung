import com.constitutionatlas.catalog.CatalogServiceApplication
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.CorrelationIdFilter
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.assertj.core.api.Assertions.assertThat
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
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
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

    @MockBean
    lateinit var settingsUsage: com.constitutionatlas.catalog.client.SettingsUsageClient

    @Autowired lateinit var writes: com.constitutionatlas.catalog.service.CatalogWriteService

    @MockBean lateinit var readiness: com.constitutionatlas.catalog.client.SuccessorReadinessClient

    @MockBean
    lateinit var identityClient: IdentityClient

    private val editor =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000410"), "local-editor@example.local", listOf("editor"))
    private val publisher =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000412"), "local-publisher@example.local", listOf("publisher"))
    private val viewer =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000414"), "local-viewer@example.local", listOf("viewer"))

    @Test
    fun successorReservationRetriesRequireCompleteContentAndRejectChangedPayload() {
        writes.createCountry(com.constitutionatlas.catalog.api.CreateCountryRequest("QZ", "Reservation country"))
        val constitution = writes.createConstitution("QZ", com.constitutionatlas.catalog.api.CreateConstitutionRequest("reservation-${UUID.randomUUID()}", "Reservation test"))
        val initial = writes.createDraftVersion(constitution.id, com.constitutionatlas.catalog.api.CreateVersionRequest("0"))
        writes.publishVersion(initial.id)
        val attempt = UUID.randomUUID()
        val request = com.constitutionatlas.catalog.api.CreateVersionRequest("1", predecessorVersionId = initial.id, hopKind = "editorial_correction", publicationComment = "Correction", publishAttemptId = attempt)
        val reserved = writes.createDraftVersion(constitution.id, request)
        assertThat(writes.createDraftVersion(constitution.id, request).id).isEqualTo(reserved.id)
        assertThat(writes.publishAttempt(attempt).id).isEqualTo(reserved.id)
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) { writes.createDraftVersion(constitution.id, request.copy(publicationComment = "Changed request")) }
        val settings = settingsRepository.forVersion(reserved.id).id
        Mockito.doThrow(com.constitutionatlas.catalog.ConflictException("Incomplete roots")).`when`(readiness).requireReady(reserved.id, attempt, settings)
        org.junit.jupiter.api.Assertions.assertThrows(com.constitutionatlas.catalog.ConflictException::class.java) { writes.publishVersion(reserved.id) }
        assertThat(catalogRepository.findVersion(reserved.id)!!.publicationStatus).isEqualTo("draft")
        Mockito.doNothing().`when`(readiness).requireReady(reserved.id, attempt, settings)
        assertThat(writes.publishVersion(reserved.id).publicationStatus).isEqualTo("published")
        assertThat(writes.createDraftVersion(constitution.id, request).id).isEqualTo(reserved.id)
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
        Mockito.reset(identityClient)
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
        val initial = mockMvc.get("/constitutions/$constitutionId/settings").andReturn()
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
        mockMvc.get("/versions/$versionId/settings").andExpect {
            status { isOk() }
            jsonPath("$.id") { value(revisionId) }
            jsonPath("$.outline.kinds[0].displayLabel") { value("Article") }
        }
        mockMvc.get("/versions/$versionId/reader-settings").andExpect {
            status { isOk() }
            jsonPath("$.kinds[0].displayLabel") { value("Provision") }
        }
        mockMvc.put("/constitutions/$constitutionId/settings") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = request
        }.andExpect { status { isConflict() } }
        val current = objectMapper.readTree(mockMvc.get("/constitutions/$constitutionId/settings").andReturn().response.contentAsString).get("id").asText()
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
        mockMvc.get("/versions/$versionId/reader-settings").andExpect { jsonPath("$.kinds[0].displayLabel") { value("Article") } }
        mockMvc.get("/versions/$versionId/settings").andExpect { jsonPath("$.id") { value(revisionId) } }
    }

    @Test
    fun repeatedOutlineImportKeepsCurrentRevisionDespiteGrandfatheredContent() {
        val id = "01900000-0000-4000-8000-000000000002"
        val initial = objectMapper.readTree(mockMvc.get("/constitutions/$id/settings").andReturn().response.contentAsString)
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
        mockMvc.get("/constitutions/$id/settings").andExpect { jsonPath("$.id") { value(initial.path("id").asText()) } }
        val displayKinds = kinds.deepCopy<com.fasterxml.jackson.databind.node.ArrayNode>()
        (displayKinds[0] as com.fasterxml.jackson.databind.node.ObjectNode).put("displayLabel", "Grandfathered provision")
        mockMvc.put("/constitutions/$id/settings") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevisionId":"${initial.path("id").asText()}","kinds":$displayKinds}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.outline.kinds[0].displayLabel") { value("Grandfathered provision") }
        }
        val updated = objectMapper.readTree(mockMvc.get("/constitutions/$id/settings").andReturn().response.contentAsString)
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

        mockMvc.get("/countries/FR").andExpect {
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

        mockMvc.get("/constitutions/$constitutionId/versions")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(2) }
                jsonPath("$[*].versionLabel") {
                    value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem(editorialLabel)))
                }
                jsonPath("$[?(@.versionLabel=='2020')].latestPublished") { value(true) }
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

        mockMvc.get("/versions/$versionId")
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
    fun editorialHopOnOlderLawAfterLaterLegalExists() {
        mockMvc.post("/countries") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"be","name":"Belgium"}"""
        }.andExpect { status { isCreated() } }

        val constitutionId =
            mockMvc.post("/countries/BE/constitutions") {
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

        mockMvc.get("/countries/BE")
            .andExpect {
                status { isOk() }
                jsonPath("$.constitutions[0].versions.length()") { value(2) }
                jsonPath("$.constitutions[0].latestVersionId") { value(law2022) }
            }
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private const val PUBLISHER_TOKEN = "Bearer publisher-token"
        private const val VIEWER_TOKEN = "Bearer viewer-token"
        private val objectMapper = ObjectMapper()

        private fun gatewayContract(contractFile: String): JsonNode =
            objectMapper.readTree(File("../../apps/gateway-web/lib/contracts/$contractFile"))

        private fun assertJsonEquals(contractFile: String, actualJson: String) {
            val expected: JsonNode = gatewayContract(contractFile)
            val actual: JsonNode = objectMapper.readTree(actualJson)
            assertThat(actual).isEqualTo(expected)
        }

        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

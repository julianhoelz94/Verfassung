import com.constitutionatlas.catalog.CatalogServiceApplication
import com.constitutionatlas.catalog.CorrelationIdFilter
import com.constitutionatlas.catalog.UnauthorizedException
import com.constitutionatlas.catalog.client.Actor
import com.constitutionatlas.catalog.client.IdentityClient
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
@AutoConfigureMockMvc
@SpringBootTest(classes = [CatalogServiceApplication::class])
class CatalogApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @MockBean
    lateinit var identityClient: IdentityClient

    private val editor =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000410"), "local-editor@example.local", listOf("editor"))
    private val publisher =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000412"), "local-publisher@example.local", listOf("publisher"))
    private val viewer =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000414"), "local-viewer@example.local", listOf("viewer"))

    @BeforeEach
    fun stubIdentity() {
        Mockito.reset(identityClient)
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
    fun putOutlineReplacesLayers() {
        mockMvc.put("/constitutions/01900000-0000-4000-8000-000000000002/content-outline") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {"kinds":[
                  {"kindCode":"article","displayLabel":"Article","presentation":"section","showLabel":true,"showTitle":true,"showKind":true},
                  {"kindCode":"paragraph","displayLabel":"Paragraph","presentation":"section","showLabel":true,"showTitle":false,"showKind":false}
                ]}
            """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.outline.kinds.length()") { value(2) }
            jsonPath("$.outline.kinds[1].kindCode") { value("paragraph") }
            jsonPath("$.versionIds.length()") { value(3) }
        }
        mockMvc.put("/constitutions/01900000-0000-4000-8000-000000000002/content-outline") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {"kinds":[
                  {"kindCode":"article","displayLabel":"Article","presentation":"section","showLabel":true,"showTitle":true,"showKind":true},
                  {"kindCode":"paragraph","displayLabel":"Paragraph","presentation":"section","showLabel":true,"showTitle":true,"showKind":false},
                  {"kindCode":"sentence","displayLabel":"Sentence","presentation":"concatenated","showLabel":false,"showTitle":false,"showKind":false}
                ]}
            """.trimIndent()
        }.andExpect { status { isOk() } }
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

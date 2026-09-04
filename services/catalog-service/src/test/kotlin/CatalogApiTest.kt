import com.constitutionatlas.catalog.CatalogServiceApplication
import com.constitutionatlas.catalog.CorrelationIdFilter
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
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

    @Test
    fun listCountriesIncludesGermany() {
        mockMvc.get("/countries")
            .andExpect {
                status { isOk() }
                jsonPath("$[*].isoCode") { value(org.hamcrest.Matchers.hasItem("DE")) }
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
                jsonPath("$.constitutions[0].versions[1].versionLabel") { value("2022") }
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
            }
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
    fun createCountryAndDraftVersionThenPublish() {
        mockMvc.post("/countries") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"isoCode":"fr","name":"France"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.isoCode") { value("FR") }
        }

        val constitutionId = mockMvc.post("/countries/FR/constitutions") {
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
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionLabel":"1958","effectiveDate":"1958-10-04"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.publicationStatus") { value("draft") }
        }.andReturn().response.contentAsString.let {
            Regex("\"id\":\"([^\"]+)\"").find(it)!!.groupValues[1]
        }

        mockMvc.post("/versions/$versionId/publish").andExpect {
            status { isOk() }
            jsonPath("$.publicationStatus") { value("published") }
        }

        mockMvc.get("/countries/FR").andExpect {
            status { isOk() }
            jsonPath("$.constitutions[0].versions[0].versionLabel") { value("1958") }
        }
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

    companion object {
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

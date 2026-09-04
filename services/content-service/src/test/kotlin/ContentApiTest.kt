import com.constitutionatlas.content.ContentServiceApplication
import com.constitutionatlas.content.CorrelationIdFilter
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
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.put
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.io.File
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [ContentServiceApplication::class])
class ContentApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun listArticlesFor2022VersionIsOrdered() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/articles")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(10) }
                jsonPath("$[0].articleNumber") { value("1") }
                jsonPath("$[5].articleNumber") { value("16a") }
                header { string("X-Total-Count", "10") }
            }
    }

    @Test
    fun listArticlesHonorsLimitAndOffset() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/articles") {
            param("offset", "0")
            param("limit", "2")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            header { string("X-Total-Count", "10") }
        }
    }

    @Test
    fun listArticlesReportsTotalWhenPageIsCapped() {
        val versionId = "01900000-0000-4000-8000-000000000198"
        val articles =
            (1..201).joinToString(",") { index ->
                """{"articleNumber":"$index","title":"A$index","body":"Body $index.","sortOrder":$index}"""
            }
        mockMvc.put("/versions/$versionId/articles") {
            contentType = MediaType.APPLICATION_JSON
            content = "[$articles]"
        }.andExpect { status { isOk() } }
        mockMvc.get("/versions/$versionId/articles") {
            param("limit", "200")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(200) }
            header { string("X-Total-Count", "201") }
        }
        mockMvc.get("/versions/$versionId/articles").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(201) }
            header { string("X-Total-Count", "201") }
        }
    }

    @Test
    fun listArticlesCanIncludeBody() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/articles") {
            param("includeBody", "true")
            param("limit", "1")
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].body") { exists() }
        }
    }

    @Test
    fun getArticleReturnsBody() {
        mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
            .andExpect {
                status { isOk() }
                jsonPath("$.title") { value("Human dignity") }
                jsonPath("$.body") { exists() }
                jsonPath("$.children.length()") { value(2) }
                jsonPath("$.children[0].kind") { value("paragraph") }
                jsonPath("$.children[1].children[0].kind") { value("sentence") }
            }
    }

    @Test
    fun unknownArticleReturns404() {
        mockMvc.get("/articles/${UUID.fromString("00000000-0000-4000-8000-000000000099")}")
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun patchArticleUpdatesTextAndKeepsTree() {
        val original = objectMapper.readTree(
            mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
                .andReturn().response.contentAsString,
        )
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000201") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Dignity","body":"Updated dignity text."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value("01900000-0000-4000-8000-000000000201") }
            jsonPath("$.title") { value("Dignity") }
            jsonPath("$.body") { value("Updated dignity text.") }
            jsonPath("$.children.length()") { value(2) }
            jsonPath("$.children[0].kind") { value("paragraph") }
        }
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000201") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":${objectMapper.writeValueAsString(original.get("title").asText())},"body":${objectMapper.writeValueAsString(original.get("body").asText())}}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun unknownVersionReturnsEmptyList() {
        mockMvc.get("/versions/${UUID.fromString("00000000-0000-4000-8000-000000000099")}/articles")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(0) }
            }
    }

    @Test
    fun replaceArticlesForNewVersion() {
        val versionId = "01900000-0000-4000-8000-000000000099"
        mockMvc.put("/versions/$versionId/articles") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                [
                  {"articleNumber":"1","title":"One","body":"First.","sortOrder":1},
                  {"articleNumber":"2","title":"Two","body":"Second.","sortOrder":2}
                ]
            """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].articleNumber") { value("1") }
        }
    }

    @Test
    fun articleListMatchesGatewayContract() {
        val json = mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/articles")
            .andReturn().response.contentAsString
        assertJsonEquals("content-articles.json", json)
    }

    @Test
    fun articleDetailMatchesGatewayContract() {
        val json = mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
            .andReturn().response.contentAsString
        assertJsonEquals("content-article.json", json)
    }

    @Test
    fun echoesProvidedCorrelationId() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/articles") {
            header(CorrelationIdFilter.HEADER, "test-corr-1")
        }.andExpect {
            status { isOk() }
            header { string(CorrelationIdFilter.HEADER, "test-corr-1") }
        }
    }

    companion object {
        private val objectMapper = ObjectMapper()

        private fun assertJsonEquals(contractFile: String, actualJson: String) {
            val expected: JsonNode = objectMapper.readTree(
                File("../../apps/gateway-web/lib/contracts/$contractFile"),
            )
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

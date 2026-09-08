import com.constitutionatlas.content.CatalogUnavailableException
import com.constitutionatlas.content.ContentServiceApplication
import com.constitutionatlas.content.CorrelationIdFilter
import com.constitutionatlas.content.UnauthorizedException
import com.constitutionatlas.content.client.Actor
import com.constitutionatlas.content.client.CatalogClient
import com.constitutionatlas.content.client.CatalogVersion
import com.constitutionatlas.content.client.IdentityClient
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
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
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

    @MockBean
    lateinit var identityClient: IdentityClient

    @MockBean
    lateinit var catalogClient: CatalogClient

    private val editor =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000410"), "local-editor@example.local", listOf("editor"))

    @BeforeEach
    fun stubIdentity() {
        Mockito.reset(identityClient, catalogClient)
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(editor)
    }

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
            header("Authorization", TOKEN)
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
            jsonPath("$.length()") { value(200) }
            header { string("X-Total-Count", "201") }
        }
        mockMvc.get("/versions/$versionId/articles") {
            param("limit", "500")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(200) }
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
            jsonPath("$[0].children.length()") { value(2) }
            jsonPath("$[0].children[0].kind") { value("paragraph") }
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
    fun patchTitleKeepsTreeWhenBodyUnchanged() {
        val original = objectMapper.readTree(
            mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
                .andReturn().response.contentAsString,
        )
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000201") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Dignity","body":${objectMapper.writeValueAsString(original.get("body").asText())}}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value("01900000-0000-4000-8000-000000000201") }
            jsonPath("$.title") { value("Dignity") }
            jsonPath("$.body") { value(original.get("body").asText()) }
            jsonPath("$.children.length()") { value(2) }
            jsonPath("$.children[0].kind") { value("paragraph") }
        }
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000201") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":${objectMapper.writeValueAsString(original.get("title").asText())},"body":${objectMapper.writeValueAsString(original.get("body").asText())}}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun patchBodyReplacesTreeWithRootText() {
        val original = objectMapper.readTree(
            mockMvc.get("/articles/01900000-0000-4000-8000-000000000101")
                .andReturn().response.contentAsString,
        )
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000101") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Dignity","body":"Updated dignity text."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Dignity") }
            jsonPath("$.body") { value("Updated dignity text.") }
            jsonPath("$.children.length()") { value(0) }
        }
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000101") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":${objectMapper.writeValueAsString(original.get("title").asText())},"body":${objectMapper.writeValueAsString(original.get("body").asText())}}"""
        }.andExpect { status { isOk() } }
        restore1949Article1Tree()
    }

    @Test
    fun restructureMergesRemovedKindIntoParent() {
        mockMvc.post("/versions/01900000-0000-4000-8000-000000000003/restructure") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"keepKinds":["article","paragraph"]}"""
        }.andExpect {
            status { isOk() }
        }
        mockMvc.get("/articles/01900000-0000-4000-8000-000000000101")
            .andExpect {
                status { isOk() }
                jsonPath("$.children.length()") { value(1) }
                jsonPath("$.children[0].kind") { value("paragraph") }
                jsonPath("$.children[0].children.length()") { value(0) }
                jsonPath("$.children[0].body") { value("Human dignity shall be inviolable. To respect and protect it shall be the duty of all state authority.") }
            }
        restore1949Article1Tree()
    }

    @Test
    fun patchNestedNodeTitle() {
        mockMvc.patch("/nodes/01900000-0000-4000-8000-000000000121") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Dignity of the person"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value("01900000-0000-4000-8000-000000000121") }
            jsonPath("$.kind") { value("paragraph") }
            jsonPath("$.title") { value("Dignity of the person") }
        }
        mockMvc.get("/articles/01900000-0000-4000-8000-000000000101")
            .andExpect {
                status { isOk() }
                jsonPath("$.children[0].title") { value("Dignity of the person") }
            }
        mockMvc.patch("/nodes/01900000-0000-4000-8000-000000000121") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":""}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value(null) }
        }
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
            header("Authorization", TOKEN)
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
    fun replaceArticlesWritesChildNodes() {
        val versionId = "01900000-0000-4000-8000-000000000098"
        mockMvc.put("/versions/$versionId/articles") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                [
                  {
                    "articleNumber":"I",
                    "title":"Legislative Power",
                    "body":"",
                    "sortOrder":1,
                    "nodes":[
                      {"kind":"section","label":"1","title":"Congress","body":"All legislative Powers herein granted shall be vested in a Congress."}
                    ]
                  }
                ]
            """.trimIndent()
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
        }
        mockMvc.get("/versions/$versionId/articles?includeBody=true")
            .andExpect {
                status { isOk() }
                jsonPath("$[0].children.length()") { value(1) }
                jsonPath("$[0].children[0].kind") { value("section") }
                jsonPath("$[0].children[0].title") { value("Congress") }
                jsonPath("$[0].body") { value("All legislative Powers herein granted shall be vested in a Congress.") }
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

    @Test
    fun mutatingWritesRequireIdentityBearer() {
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000201") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"X","body":"Y"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun publishedVersionRejectsWritesWith409() {
        val versionId = UUID.fromString("01900000-0000-4000-8000-000000000004")
        Mockito.`when`(catalogClient.getVersion(versionId)).thenReturn(
            CatalogVersion(versionId, "published"),
        )
        val original = objectMapper.readTree(
            mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
                .andReturn().response.contentAsString,
        )
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000201") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Mutated","body":"should not persist"}"""
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("version_published") }
        }
        mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
            .andExpect {
                status { isOk() }
                jsonPath("$.title") { value(original.get("title").asText()) }
                jsonPath("$.body") { value(original.get("body").asText()) }
            }
    }

    @Test
    fun catalogDownRejectsWritesWith503() {
        val versionId = UUID.fromString("01900000-0000-4000-8000-000000000004")
        Mockito.`when`(catalogClient.getVersion(versionId)).thenThrow(
            CatalogUnavailableException("catalog version lookup failed"),
        )
        val original = objectMapper.readTree(
            mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
                .andReturn().response.contentAsString,
        )
        mockMvc.patch("/articles/01900000-0000-4000-8000-000000000201") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Mutated","body":"should not persist"}"""
        }.andExpect { status { isServiceUnavailable() } }
        mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
            .andExpect {
                status { isOk() }
                jsonPath("$.title") { value(original.get("title").asText()) }
            }
    }

    @Test
    fun replaceArticlesRejectsDeeplyNestedJson() {
        mockMvc.put("/versions/01900000-0000-4000-8000-000000000099/articles") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = nestedJson(40)
        }.andExpect { status { isBadRequest() } }
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private val objectMapper = ObjectMapper()

        private fun nestedJson(depth: Int): String = (1..depth).fold("1") { acc, _ -> """{"x":$acc}""" }

        private fun restore1949Article1Tree() {
            postgres.createConnection("").use { connection ->
                connection.createStatement().use { statement ->
                    statement.execute(
                        "DELETE FROM content_nodes WHERE parent_id = '01900000-0000-4000-8000-000000000101' OR parent_id = '01900000-0000-4000-8000-000000000121'",
                    )
                    statement.execute(
                        """
                        INSERT INTO content_nodes (id, version_id, kind, parent_id, label, number, title, body, sort_order) VALUES
                          ('01900000-0000-4000-8000-000000000121', '01900000-0000-4000-8000-000000000003', 'paragraph', '01900000-0000-4000-8000-000000000101', '(1)', NULL, NULL, NULL, 1),
                          ('01900000-0000-4000-8000-000000000122', '01900000-0000-4000-8000-000000000003', 'sentence', '01900000-0000-4000-8000-000000000121', '1', NULL, NULL, 'Human dignity shall be inviolable.', 1),
                          ('01900000-0000-4000-8000-000000000123', '01900000-0000-4000-8000-000000000003', 'sentence', '01900000-0000-4000-8000-000000000121', '2', NULL, NULL, 'To respect and protect it shall be the duty of all state authority.', 2)
                        """.trimIndent(),
                    )
                    statement.execute(
                        "UPDATE content_nodes SET title = 'Human dignity', body = NULL WHERE id = '01900000-0000-4000-8000-000000000101'",
                    )
                }
            }
        }

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

import com.constitutionatlas.editor.EditorServiceApplication
import com.constitutionatlas.editor.api.Actor
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.IdentityClient
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
import org.springframework.test.web.servlet.post
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [EditorServiceApplication::class])
class EditorApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockBean
    lateinit var identityClient: IdentityClient

    @MockBean
    lateinit var auditClient: AuditClient

    private val actor = Actor(
        UUID.fromString("01900000-0000-4000-8000-000000000410"),
        "local-editor@example.local",
        listOf("editor"),
    )

    @BeforeEach
    fun stubEditor() {
        Mockito.`when`(identityClient.authenticate("Bearer test-token")).thenReturn(actor)
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(
            com.constitutionatlas.editor.UnauthorizedException("Missing session"),
        )
    }

    @Test
    fun createSaveAndPreviewDraft() {
        val versionId = "01900000-0000-4000-8000-000000000004"
        val sessionJson = mockMvc.post("/edit-sessions") {
            header("Authorization", "Bearer test-token")
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionId":"$versionId"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.versionId") { value(versionId) }
            jsonPath("$.status") { value("open") }
        }.andReturn().response.contentAsString
        val sessionId = Regex("\"id\":\"([^\"]+)\"").find(sessionJson)!!.groupValues[1]

        mockMvc.post("/edit-sessions/$sessionId/saves") {
            header("Authorization", "Bearer test-token")
            contentType = MediaType.APPLICATION_JSON
            content = """{"articleId":"01900000-0000-4000-8000-000000000201","title":"Human dignity","body":"Draft body."}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.revisionCount") { value(1) }
            jsonPath("$.latestSnapshot") { exists() }
        }

        mockMvc.get("/edit-sessions/$sessionId") {
            header("Authorization", "Bearer test-token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.revisionCount") { value(1) }
        }

        mockMvc.post("/edit-sessions/$sessionId/review") {
            header("Authorization", "Bearer test-token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("reviewing") }
        }

        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", "Bearer test-token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
        }
    }

    @Test
    fun missingTokenIsUnauthorized() {
        mockMvc.post("/edit-sessions") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionId":"01900000-0000-4000-8000-000000000004"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    companion object {
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

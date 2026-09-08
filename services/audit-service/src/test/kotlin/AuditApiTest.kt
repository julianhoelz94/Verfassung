import com.constitutionatlas.audit.AuditServiceApplication
import com.constitutionatlas.audit.client.Actor
import com.constitutionatlas.audit.client.IdentityClient
import com.constitutionatlas.audit.client.UnauthorizedException
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
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [AuditServiceApplication::class])
class AuditApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @MockBean
    lateinit var identityClient: IdentityClient

    private val editor =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000410"), "local-editor@example.local", listOf("editor"))
    private val machine =
        Actor(
            UUID.fromString("01900000-0000-4000-8000-000000000499"),
            "service:audit",
            emptyList(),
            listOf("audit:append"),
        )

    @BeforeEach
    fun stubIdentity() {
        Mockito.reset(identityClient)
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(editor)
        Mockito.`when`(identityClient.authenticate(MACHINE)).thenReturn(machine)
    }

    @Test
    fun appendAndListByEntity() {
        mockMvc.post("/events") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "actorId": "01900000-0000-4000-8000-000000000410",
                  "actorEmail": "local-editor@example.local",
                  "action": "draft_saved",
                  "entityType": "edit_session",
                  "entityId": "01900000-0000-4000-8000-000000000501"
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.action") { value("draft_saved") }
        }

        mockMvc.get("/events") {
            param("entityType", "edit_session")
            param("entityId", "01900000-0000-4000-8000-000000000501")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].actorEmail") { value("local-editor@example.local") }
        }
    }

    @Test
    fun appendAllowsUnknownActor() {
        mockMvc.post("/events") {
            header("Authorization", MACHINE)
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "action": "login_failed",
                  "entityType": "user",
                  "entityId": "00000000-0000-4000-8000-000000000000",
                  "payload": {"correlationId": "corr-1", "clientIp": "198.51.100.20"}
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.action") { value("login_failed") }
            jsonPath("$.actorId") { value(null as String?) }
            jsonPath("$.actorEmail") { value(null as String?) }
        }
    }

    @Test
    fun updatesAndDeletesAreRejected() {
        mockMvc.put("/events/01900000-0000-4000-8000-000000000501") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isMethodNotAllowed() } }

        mockMvc.delete("/events/01900000-0000-4000-8000-000000000501") {
            header("Authorization", TOKEN)
        }.andExpect { status { isMethodNotAllowed() } }

        jdbcTemplate.update(
            """
            INSERT INTO audit_events (id, actor_id, actor_email, action, entity_type, entity_id)
            VALUES ('01900000-0000-4000-8000-000000000599', '01900000-0000-4000-8000-000000000410',
                    'a@b.c', 'draft_saved', 'edit_session', '01900000-0000-4000-8000-000000000501')
            """.trimIndent(),
        )
        jdbcTemplate.update("DELETE FROM audit_events WHERE id = '01900000-0000-4000-8000-000000000599'")
        val afterRule = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM audit_events WHERE id = '01900000-0000-4000-8000-000000000599'", Int::class.java)
        check(afterRule == 1)
    }

    @Test
    fun appendRequiresIdentityBearer() {
        mockMvc.post("/events") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"action":"login_failed","entityType":"user","entityId":"00000000-0000-4000-8000-000000000000"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private const val MACHINE = "Bearer machine-token"
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

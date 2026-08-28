import com.constitutionatlas.identity.IdentityServiceApplication
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [IdentityServiceApplication::class])
class IdentityApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun seedStoresLocalEditor() {
        val count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM users WHERE email = ?",
            Int::class.java,
            "local-editor@example.local",
        )
        check(count == 1)
        val roles = jdbcTemplate.queryForList(
            """
            SELECT r.name FROM roles r
            JOIN user_roles ur ON ur.role_id = r.id
            JOIN users u ON u.id = ur.user_id
            WHERE u.email = ?
            """.trimIndent(),
            String::class.java,
            "local-editor@example.local",
        )
        check(roles == listOf("editor"))
    }

    @Test
    fun editorCanLoginAndReadMe() {
        val token = mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"local-editor@example.local","password":"change-me"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.user.email") { value("local-editor@example.local") }
            jsonPath("$.user.roles[0]") { value("editor") }
            jsonPath("$.token") { exists() }
        }.andReturn().response.contentAsString.let {
            Regex("\"token\":\"([^\"]+)\"").find(it)!!.groupValues[1]
        }

        mockMvc.get("/me") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.roles[0]") { value("editor") }
        }
    }

    @Test
    fun badPasswordIsUnauthorized() {
        mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"local-editor@example.local","password":"wrong"}"""
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
            registry.add("identity.seed.editor-email") { "local-editor@example.local" }
            registry.add("identity.seed.editor-password") { "change-me" }
        }
    }
}

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
    fun seedStoresSeparableEditorialRoles() {
        val editorRoles = rolesFor("local-editor@example.local")
        check(editorRoles.toSet() == setOf("editor", "reviewer", "publisher"))
        val reviewerRoles = rolesFor("local-reviewer@example.local")
        check(reviewerRoles == listOf("reviewer"))
        val publisherRoles = rolesFor("local-publisher@example.local")
        check(publisherRoles == listOf("publisher"))
    }

    @Test
    fun editorCanLoginAndReadMe() {
        val token = login("local-editor@example.local", "change-me")
        mockMvc.get("/me") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.roles.length()") { value(3) }
            jsonPath("$.roles[0]") { value("editor") }
        }
    }

    @Test
    fun reviewerAndPublisherCanLoginWithOnlyTheirRole() {
        login("local-reviewer@example.local", "change-me")
        login("local-publisher@example.local", "change-me")
    }

    @Test
    fun badPasswordIsUnauthorized() {
        mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"local-editor@example.local","password":"wrong"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    private fun rolesFor(email: String): List<String> =
        jdbcTemplate.queryForList(
            """
            SELECT r.name FROM roles r
            JOIN user_roles ur ON ur.role_id = r.id
            JOIN users u ON u.id = ur.user_id
            WHERE u.email = ?
            ORDER BY r.name
            """.trimIndent(),
            String::class.java,
            email,
        )

    private fun login(email: String, password: String): String {
        val expectedRole = when (email) {
            "local-reviewer@example.local" -> "reviewer"
            "local-publisher@example.local" -> "publisher"
            else -> "editor"
        }
        return mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email","password":"$password"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.user.email") { value(email) }
            jsonPath("$.user.roles[0]") { value(expectedRole) }
            jsonPath("$.token") { exists() }
        }.andReturn().response.contentAsString.let {
            Regex("\"token\":\"([^\"]+)\"").find(it)!!.groupValues[1]
        }
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
            registry.add("identity.seed.reviewer-email") { "local-reviewer@example.local" }
            registry.add("identity.seed.reviewer-password") { "change-me" }
            registry.add("identity.seed.publisher-email") { "local-publisher@example.local" }
            registry.add("identity.seed.publisher-password") { "change-me" }
        }
    }
}

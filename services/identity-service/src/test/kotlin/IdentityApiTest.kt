import com.constitutionatlas.identity.IdentityServiceApplication
import com.constitutionatlas.identity.service.IdentitySeedRunner
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
@AutoConfigureMockMvc
@ActiveProfiles("local-stack")
@SpringBootTest(classes = [IdentityServiceApplication::class])
class IdentityApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var identitySeedRunner: IdentitySeedRunner

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
    fun loginReturnsExpiresInSecondsAndRotatesPreviousSession() {
        val first = login("local-editor@example.local", "change-me")
        check(first.length >= 43)
        check(!first.contains("-") || first.length != 36)
        val second =
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                header("Authorization", "Bearer $first")
                content = """{"email":"local-editor@example.local","password":"change-me"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.expiresInSeconds") { value(86400) }
                jsonPath("$.token") { exists() }
            }.andReturn().response.contentAsString.let {
                Regex("\"token\":\"([^\"]+)\"").find(it)!!.groupValues[1]
            }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $first")
        }.andExpect { status { isUnauthorized() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $second")
        }.andExpect { status { isOk() } }
    }

    @Test
    fun userCanListAndRevokeSessions() {
        val token = login("local-reviewer@example.local", "change-me")
        val sessionsJson =
            mockMvc.get("/sessions") {
                header("Authorization", "Bearer $token")
            }.andExpect {
                status { isOk() }
            }.andReturn().response.contentAsString
        val sessionId =
            Regex(""""id":"([^"]+)"[^}]*"current":true""").find(sessionsJson)!!.groupValues[1]
        mockMvc.delete("/sessions/$sessionId") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isNoContent() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun unknownEmailAndBadPasswordAreIndistinguishable() {
        val unknown =
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Forwarded-For", "198.51.100.10")
                content = """{"email":"missing@example.local","password":"wrong"}"""
            }.andExpect { status { isUnauthorized() } }.andReturn().response.contentAsString
        val bad =
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Forwarded-For", "198.51.100.11")
                content = """{"email":"local-editor@example.local","password":"wrong"}"""
            }.andExpect { status { isUnauthorized() } }.andReturn().response.contentAsString
        check(unknown == bad)
        check(unknown.contains("Invalid credentials"))
    }

    @Test
    fun repeatedFailuresLockAccountEvenWithCorrectPassword() {
        repeat(5) {
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Forwarded-For", "203.0.113.50")
                content = """{"email":"locked-user@example.local","password":"wrong"}"""
            }.andExpect { status { isUnauthorized() } }
        }
        mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            header("X-Forwarded-For", "203.0.113.50")
            content = """{"email":"locked-user@example.local","password":"change-me"}"""
        }.andExpect { status { isTooManyRequests() } }
        login("local-editor@example.local", "change-me")
    }

    @Test
    fun createOnlySeedDoesNotResetExistingPasswordHash() {
        val before = hashFor("local-editor@example.local")
        identitySeedRunner.run(DefaultApplicationArguments())
        val after = hashFor("local-editor@example.local")
        check(before == after)
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
            header("X-Forwarded-For", "198.51.100.12")
            content = """{"email":"local-editor@example.local","password":"wrong"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    private fun hashFor(email: String): String =
        jdbcTemplate.queryForObject(
            "SELECT password_hash FROM users WHERE email = ?",
            String::class.java,
            email,
        ) ?: error("missing hash for $email")

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
            jsonPath("$.expiresInSeconds") { exists() }
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
            registry.add("identity.seed.mode") { "create-only" }
            registry.add("identity.seed.editor-email") { "local-editor@example.local" }
            registry.add("identity.seed.editor-password") { "change-me" }
            registry.add("identity.seed.reviewer-email") { "local-reviewer@example.local" }
            registry.add("identity.seed.reviewer-password") { "change-me" }
            registry.add("identity.seed.publisher-email") { "local-publisher@example.local" }
            registry.add("identity.seed.publisher-password") { "change-me" }
            registry.add("identity.seed.admin-email") { "local-admin@example.local" }
            registry.add("identity.seed.admin-password") { "change-me" }
            registry.add("identity.seed.viewer-email") { "local-viewer@example.local" }
            registry.add("identity.seed.viewer-password") { "change-me" }
            registry.add("LOCAL_EDITOR_EMAIL") { "local-editor@example.local" }
            registry.add("LOCAL_EDITOR_PASSWORD") { "change-me" }
            registry.add("LOCAL_REVIEWER_EMAIL") { "local-reviewer@example.local" }
            registry.add("LOCAL_REVIEWER_PASSWORD") { "change-me" }
            registry.add("LOCAL_PUBLISHER_EMAIL") { "local-publisher@example.local" }
            registry.add("LOCAL_PUBLISHER_PASSWORD") { "change-me" }
            registry.add("LOCAL_ADMIN_EMAIL") { "local-admin@example.local" }
            registry.add("LOCAL_ADMIN_PASSWORD") { "change-me" }
            registry.add("LOCAL_VIEWER_EMAIL") { "local-viewer@example.local" }
            registry.add("LOCAL_VIEWER_PASSWORD") { "change-me" }
        }
    }
}

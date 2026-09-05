import com.constitutionatlas.identity.IdentityServiceApplication
import com.constitutionatlas.identity.client.AuditClient
import com.constitutionatlas.identity.client.AuthAudit
import com.constitutionatlas.identity.service.AccountService
import com.constitutionatlas.identity.service.IdentitySeedRunner
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
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
import java.io.File

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

    @Autowired
    lateinit var accountService: AccountService

    @Autowired
    lateinit var authAudit: AuthAudit

    @MockBean
    lateinit var auditClient: AuditClient

    private val objectMapper = ObjectMapper()

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
    fun logoutRevokesTheSession() {
        val token = login("local-editor@example.local", "change-me")
        mockMvc.post("/logout") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isNoContent() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun expiredSessionCannotReadMe() {
        val token = login("local-editor@example.local", "change-me")
        jdbcTemplate.update("UPDATE sessions SET expires_at = NOW() - INTERVAL '1 hour'")
        mockMvc.get("/me") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun disabledUserCannotLogin() {
        jdbcTemplate.update("UPDATE users SET enabled = FALSE WHERE email = ?", "local-editor@example.local")
        try {
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"local-editor@example.local","password":"change-me"}"""
            }.andExpect { status { isUnauthorized() } }
        } finally {
            jdbcTemplate.update("UPDATE users SET enabled = TRUE WHERE email = ?", "local-editor@example.local")
        }
    }

    @Test
    fun disabledUserCannotReadMe() {
        val token = login("local-editor@example.local", "change-me")
        jdbcTemplate.update("UPDATE users SET enabled = FALSE WHERE email = ?", "local-editor@example.local")
        try {
            mockMvc.get("/me") {
                header("Authorization", "Bearer $token")
            }.andExpect { status { isUnauthorized() } }
        } finally {
            jdbcTemplate.update("UPDATE users SET enabled = TRUE WHERE email = ?", "local-editor@example.local")
        }
    }

    @Test
    fun openApiDocumentsLoginMeLogoutAndBearer() {
        mockMvc.get("/v3/api-docs").andExpect {
            status { isOk() }
            jsonPath("$.paths./login.post") { exists() }
            jsonPath("$.paths./me.get") { exists() }
            jsonPath("$.paths./logout.post") { exists() }
            jsonPath("$.components.securitySchemes.bearer-session.scheme") { value("bearer") }
            jsonPath("$.paths./users/invites.post") { exists() }
            jsonPath("$.paths./password/reset.post") { exists() }
        }
    }

    @Test
    fun meMatchesGatewayContractShape() {
        val token = login("local-editor@example.local", "change-me")
        val json =
            mockMvc.get("/me") {
                header("Authorization", "Bearer $token")
            }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val actual = objectMapper.readTree(json)
        val expected = objectMapper.readTree(File("../../apps/gateway-web/lib/contracts/identity-me.json"))
        check(actual.get("email").asText() == expected.get("email").asText())
        check(actual.get("roles").toString() == expected.get("roles").toString())
    }

    @Test
    fun badPasswordIsUnauthorized() {
        mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            header("X-Forwarded-For", "198.51.100.12")
            content = """{"email":"local-editor@example.local","password":"wrong"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun noPublicSelfRegistration() {
        mockMvc.post("/register") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"new@example.local","password":"not-a-public-password"}"""
        }.andExpect { status { isNotFound() } }
        mockMvc.post("/users/invites") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"new@example.local","roles":["viewer"]}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun editorCannotListUsers() {
        val token = login("local-editor@example.local", "change-me")
        mockMvc.get("/users") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun adminCanInviteActivateDisableAndInspect() {
        val admin = login("local-admin@example.local", "change-me")
        val email = "invitee-${System.nanoTime()}@example.local"
        val created =
            mockMvc.post("/users/invites") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email","roles":["editor"]}"""
            }.andExpect {
                status { isCreated() }
                jsonPath("$.user.email") { value(email) }
                jsonPath("$.user.status") { value("invited") }
                jsonPath("$.user.enabled") { value(false) }
                jsonPath("$.inviteToken") { exists() }
            }.andReturn().response.contentAsString
        val inviteToken = Regex("\"inviteToken\":\"([^\"]+)\"").find(created)!!.groupValues[1]
        val userId = Regex("\"id\":\"([^\"]+)\"").find(created)!!.groupValues[1]
        mockMvc.post("/invites/accept") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$inviteToken","password":"not-a-common-pass"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("active") }
            jsonPath("$.enabled") { value(true) }
        }
        val member = login(email, "not-a-common-pass")
        mockMvc.get("/users/$userId") {
            header("Authorization", "Bearer $admin")
        }.andExpect {
            status { isOk() }
            jsonPath("$.roles[0]") { value("editor") }
        }
        mockMvc.post("/users/$userId/disable") {
            header("Authorization", "Bearer $admin")
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("disabled") }
        }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $member")
        }.andExpect { status { isUnauthorized() } }
        mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email","password":"not-a-common-pass"}"""
        }.andExpect { status { isUnauthorized() } }
        mockMvc.post("/users/$userId/enable") {
            header("Authorization", "Bearer $admin")
        }.andExpect {
            status { isOk() }
            jsonPath("$.enabled") { value(true) }
        }
        mockMvc.put("/users/$userId/roles") {
            header("Authorization", "Bearer $admin")
            contentType = MediaType.APPLICATION_JSON
            content = """{"roles":["reviewer"]}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.roles[0]") { value("reviewer") }
        }
    }

    @Test
    fun passwordChangeAndResetRevokeSessionsAndHideAccountExistence() {
        val admin = login("local-admin@example.local", "change-me")
        val email = "reset-${System.nanoTime()}@example.local"
        val created =
            mockMvc.post("/users/invites") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email","roles":["viewer"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val inviteToken = Regex("\"inviteToken\":\"([^\"]+)\"").find(created)!!.groupValues[1]
        mockMvc.post("/invites/accept") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$inviteToken","password":"not-a-common-pass"}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/invites/accept") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$inviteToken","password":"password1234"}"""
        }.andExpect { status { isBadRequest() } }
        val token = login(email, "not-a-common-pass")
        mockMvc.post("/password/change") {
            header("Authorization", "Bearer $token")
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentPassword":"not-a-common-pass","newPassword":"fresh-stable-phrase"}"""
        }.andExpect { status { isNoContent() } }
        login(email, "fresh-stable-phrase")
        val unknown =
            mockMvc.post("/password/reset") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"missing-${System.nanoTime()}@example.local"}"""
            }.andExpect { status { isNoContent() } }.andReturn().response.contentAsString
        val known =
            mockMvc.post("/password/reset") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email"}"""
            }.andExpect { status { isNoContent() } }.andReturn().response.contentAsString
        check(unknown == known)
        val resetToken = "reset-token-${System.nanoTime()}-aaaa"
        val userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", java.util.UUID::class.java, email)
        jdbcTemplate.update(
            """
            INSERT INTO password_resets (id, user_id, token_hash, expires_at)
            VALUES (?, ?, ?, NOW() + INTERVAL '1 hour')
            """.trimIndent(),
            java.util.UUID.randomUUID(),
            userId,
            accountService.hashToken(resetToken),
        )
        val session = login(email, "fresh-stable-phrase")
        mockMvc.post("/password/reset/confirm") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$resetToken","newPassword":"after-reset-phrase"}"""
        }.andExpect { status { isNoContent() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $session")
        }.andExpect { status { isUnauthorized() } }
        login(email, "after-reset-phrase")
    }

    @Test
    fun authenticationEventsAreAuditedWithoutSecrets() {
        login("local-editor@example.local", "change-me")
        val afterLogin =
            Mockito.mockingDetails(auditClient).invocations.map { invocation ->
                invocation.arguments[0] as String
            }
        check(afterLogin.contains("login_succeeded"))
        authAudit.recordMfaChange(
            java.util.UUID.fromString("01900000-0000-4000-8000-000000000410"),
            "local-editor@example.local",
            "127.0.0.1",
            "JUnit",
        )
        val payloads =
            Mockito.mockingDetails(auditClient).invocations.map { invocation ->
                invocation.arguments.joinToString(" ")
            }
        check(Mockito.mockingDetails(auditClient).invocations.any { it.arguments[0] == "mfa_changed" })
        check(payloads.none { it.contains("change-me") })
    }

    @Test
    fun commonPasswordIsRejectedOnInviteAccept() {
        val admin = login("local-admin@example.local", "change-me")
        val email = "weak-${System.nanoTime()}@example.local"
        val created =
            mockMvc.post("/users/invites") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email","roles":["viewer"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val inviteToken = Regex("\"inviteToken\":\"([^\"]+)\"").find(created)!!.groupValues[1]
        mockMvc.post("/invites/accept") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$inviteToken","password":"change-me"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun cannotEnableInvitedUserOrStripOwnAdminRole() {
        val admin = login("local-admin@example.local", "change-me")
        val email = "pending-${System.nanoTime()}@example.local"
        val created =
            mockMvc.post("/users/invites") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email","roles":["viewer"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val userId = Regex("\"id\":\"([^\"]+)\"").find(created)!!.groupValues[1]
        mockMvc.post("/users/$userId/enable") {
            header("Authorization", "Bearer $admin")
        }.andExpect { status { isBadRequest() } }
        val resent =
            mockMvc.post("/users/invites") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email","roles":["editor"]}"""
            }.andExpect {
                status { isCreated() }
                jsonPath("$.user.status") { value("invited") }
                jsonPath("$.inviteToken") { exists() }
            }.andReturn().response.contentAsString
        check(Regex("\"inviteToken\":\"([^\"]+)\"").find(resent)!!.groupValues[1].isNotBlank())
        val me =
            mockMvc.get("/me") {
                header("Authorization", "Bearer $admin")
            }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val adminId = Regex("\"id\":\"([^\"]+)\"").find(me)!!.groupValues[1]
        mockMvc.put("/users/$adminId/roles") {
            header("Authorization", "Bearer $admin")
            contentType = MediaType.APPLICATION_JSON
            content = """{"roles":["viewer"]}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun adminCanIssueResetTokenForDelivery() {
        val admin = login("local-admin@example.local", "change-me")
        val email = "issued-reset-${System.nanoTime()}@example.local"
        val created =
            mockMvc.post("/users/invites") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email","roles":["viewer"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val inviteToken = Regex("\"inviteToken\":\"([^\"]+)\"").find(created)!!.groupValues[1]
        val userId = Regex("\"id\":\"([^\"]+)\"").find(created)!!.groupValues[1]
        mockMvc.post("/invites/accept") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$inviteToken","password":"not-a-common-pass"}"""
        }.andExpect { status { isOk() } }
        val issued =
            mockMvc.post("/users/$userId/password-resets") {
                header("Authorization", "Bearer $admin")
            }.andExpect {
                status { isCreated() }
                jsonPath("$.resetToken") { exists() }
            }.andReturn().response.contentAsString
        val resetToken = Regex("\"resetToken\":\"([^\"]+)\"").find(issued)!!.groupValues[1]
        mockMvc.post("/password/reset/confirm") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$resetToken","newPassword":"after-admin-reset-phrase"}"""
        }.andExpect { status { isNoContent() } }
        login(email, "after-admin-reset-phrase")
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

    private fun login(email: String, password: String): String = mockMvc.post("/login") {
        contentType = MediaType.APPLICATION_JSON
        content = """{"email":"$email","password":"$password"}"""
    }.andExpect {
        status { isOk() }
        jsonPath("$.user.email") { value(email) }
        jsonPath("$.token") { exists() }
        jsonPath("$.expiresInSeconds") { exists() }
    }.andReturn().response.contentAsString.let {
        Regex("\"token\":\"([^\"]+)\"").find(it)!!.groupValues[1]
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

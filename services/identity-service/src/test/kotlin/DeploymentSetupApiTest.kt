import com.constitutionatlas.identity.IdentityServiceApplication
import com.constitutionatlas.identity.client.AuditClient
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.crypto.Totp
import com.constitutionatlas.identity.crypto.encodeRequired
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.setup.SetupBootstrap
import com.constitutionatlas.identity.setup.SetupRepository
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.json.JsonMapper
import java.net.InetSocketAddress
import java.time.OffsetDateTime
import java.util.concurrent.atomic.AtomicBoolean

@Testcontainers
@AutoConfigureMockMvc
@ActiveProfiles("local-stack")
@SpringBootTest(classes = [IdentityServiceApplication::class])
class DeploymentSetupApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var users: IdentityRepository

    @Autowired lateinit var setup: SetupRepository

    @Autowired lateinit var bootstrap: SetupBootstrap

    @Autowired lateinit var encoder: PasswordEncoder

    @Autowired lateinit var environment: org.springframework.core.env.ConfigurableEnvironment

    @MockitoBean lateinit var auditClient: AuditClient
    private val mapper = JsonMapper()

    @Test
    fun freshInstallationStaysClosedUntilReviewedLegalPublicationAndPersistsAcrossStartup() {
        mvc.get("/setup/status").andExpect {
            status { isOk() }
            jsonPath("$.completed") { value(false) }
            jsonPath("$.bootstrapAdminId") { doesNotExist() }
        }
        val viewer = users.insertUser("viewer@test.example", encoder.encodeRequired("viewer-password"))
        users.assignRole(viewer, users.findRoleId("viewer")!!)
        users.insertSession(viewer, Tokens.sha256Hex("old-viewer-session"), OffsetDateTime.now().plusHours(1), OffsetDateTime.now(), null, null)
        mvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"viewer@test.example","password":"viewer-password"}"""
        }.andExpect { status { isUnauthorized() } }
        mvc.get("/me") { header("Authorization", "Bearer old-viewer-session") }.andExpect { status { isUnauthorized() } }
        for (path in listOf("/registration", "/oauth/register", "/passkeys/login/start", "/users/invites")) {
            mvc.post(path) {
                contentType = MediaType.APPLICATION_JSON
                content = "{}"
            }.andExpect { status { isForbidden() } }
        }
        mvc.get("/setup").andExpect { status { isUnauthorized() } }
        val login = mvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"bootstrap@test.example","password":"bootstrap-test-password"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.mfaEnrollmentRequired") { value(true) }
        }.andReturn().response.contentAsString
        val challenge = mapper.readTree(login)["challengeToken"].asText()
        val enrollment = mvc.post("/mfa/enroll/start") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"challengeToken":"$challenge"}"""
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val secret = mapper.readTree(enrollment)["secret"].asText()
        val confirmed = mvc.post("/mfa/enroll/confirm") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"challengeToken":"$challenge","code":"${Totp.generate(secret)}"}"""
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val authorization = "Bearer " + mapper.readTree(confirmed)["token"].asText()
        mvc.get("/swagger-access").andExpect {
            status { isOk() }
            jsonPath("$.enabled") { value(true) }
        }
        mvc.put("/admin/swagger-access") {
            header("Authorization", authorization)
            contentType = MediaType.APPLICATION_JSON
            content = """{"enabled":false}"""
        }.andExpect { status { isOk() } }
        mvc.get("/swagger-access").andExpect { jsonPath("$.enabled") { value(false) } }
        mvc.get("/v3/api-docs").andExpect { status { isForbidden() } }
        mvc.get("/setup") { header("Authorization", authorization) }.andExpect {
            status { isOk() }
            jsonPath("$.status.completed") { value(false) }
        }.andReturn().response.contentAsString.also { check(!it.contains("environment-secret-password")) }
        mvc.get("/admin/settings") { header("Authorization", authorization) }.andExpect {
            status { isOk() }
            jsonPath("$.smtpHost") { value("mail.test.example") }
            jsonPath("$.smtpPasswordSet") { value(true) }
        }
        mvc.post("/setup/complete") { header("Authorization", authorization) }.andExpect { status { isBadRequest() } }
        mvc.put("/setup") {
            header("Authorization", authorization)
            contentType = MediaType.APPLICATION_JSON
            content = """{"mailDeferred":true,"accessReviewed":true,"enabledLanguages":[],"defaultLanguage":"de"}"""
        }.andExpect { status { isBadRequest() } }
        mvc.put("/setup") {
            header("Authorization", authorization)
            contentType = MediaType.APPLICATION_JSON
            content = """{"mailDeferred":false,"accessReviewed":true,"enabledLanguages":["de"],"defaultLanguage":"de"}"""
        }.andExpect { status { isOk() } }
        legalPublished.set(true)
        mvc.post("/setup/complete") { header("Authorization", authorization) }.andExpect { status { isBadRequest() } }
        legalPublished.set(false)
        mvc.put("/setup") {
            header("Authorization", authorization)
            contentType = MediaType.APPLICATION_JSON
            content = """{"mailDeferred":true,"accessReviewed":true,"enabledLanguages":["de"],"defaultLanguage":"de"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.required.length()") { value(3) }
        }
        val overrides = org.springframework.core.env.MapPropertySource("temporary-language-override", mapOf("SITE_LANGUAGES" to "en", "SITE_DEFAULT_LANGUAGE" to "en"))
        environment.propertySources.addFirst(overrides)
        try {
            mvc.put("/setup") {
                header("Authorization", authorization)
                contentType = MediaType.APPLICATION_JSON
                content = """{"mailDeferred":true,"accessReviewed":true,"enabledLanguages":["en"],"defaultLanguage":"en"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.languages.enabled[0]") { value("en") }
            }
        } finally {
            environment.propertySources.remove(overrides.name)
        }
        check(setup.get().enabledLanguages == listOf("de"))
        // Saved progress survives another startup, with credentials untouched.
        val hash = users.findUserByEmail("bootstrap@test.example")!!.passwordHash
        bootstrap.run(DefaultApplicationArguments())
        check(setup.get().mailDeferred && setup.get().enabledLanguages == listOf("de"))
        check(users.findUserByEmail("bootstrap@test.example")!!.passwordHash == hash)
        mvc.post("/setup/complete") { header("Authorization", authorization) }.andExpect { status { isBadRequest() } }
        legalPublished.set(true)
        repeat(2) {
            mvc.post("/setup/complete") { header("Authorization", authorization) }.andExpect {
                status { isOk() }
                jsonPath("$.completed") { value(true) }
            }
        }
        val completedAt = setup.get().completedAt
        bootstrap.run(DefaultApplicationArguments())
        check(setup.get().completedAt == completedAt)
        mvc.get("/me") { header("Authorization", "Bearer old-viewer-session") }.andExpect { status { isOk() } }
        mvc.put("/me/language") {
            header("Authorization", authorization)
            contentType = MediaType.APPLICATION_JSON
            content = """{"languagePreference":"en"}"""
        }.andExpect { status { isBadRequest() } }
    }

    companion object {
        private val legalPublished = AtomicBoolean(false)
        private val document = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/legal-pages/") { exchange ->
                val ok = legalPublished.get() && exchange.requestHeaders.getFirst("Authorization")?.startsWith("Bearer ") == true
                val body = "{}".toByteArray()
                exchange.sendResponseHeaders(if (ok) 200 else 404, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            }
            start()
        }

        @Container @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

        @DynamicPropertySource @JvmStatic
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("identity.seed.mode") { "off" }
            registry.add("identity.seed.admin-email") { "bootstrap@test.example" }
            registry.add("identity.seed.admin-password") { "bootstrap-test-password" }
            registry.add("identity.mfa.encryption-key") { "setup-test-key" }
            registry.add("DOCUMENT_API_URL") { "http://127.0.0.1:${document.address.port}" }
            registry.add("SMTP_ENABLED") { "true" }
            registry.add("SMTP_FROM") { "setup@test.example" }
            registry.add("SMTP_HOST") { "mail.test.example" }
            registry.add("SMTP_PASSWORD") { "environment-secret-password" }
        }
    }
}

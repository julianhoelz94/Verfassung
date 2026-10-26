import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.IdentityServiceApplication
import com.constitutionatlas.identity.TooManyRequestsException
import com.constitutionatlas.identity.api.CreateMcpKeyRequest
import com.constitutionatlas.identity.client.AuditClient
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.crypto.Totp
import com.constitutionatlas.identity.mail.OutboundMailer
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.OAuthCode
import com.constitutionatlas.identity.repo.OAuthRepository
import com.constitutionatlas.identity.repo.PasskeyRepository
import com.constitutionatlas.identity.service.AccountService
import com.constitutionatlas.identity.service.AuthService
import com.constitutionatlas.identity.service.McpKeyService
import com.constitutionatlas.identity.service.McpOAuthService
import com.constitutionatlas.identity.service.MfaService
import com.constitutionatlas.platform.UnauthorizedException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.security.MessageDigest
import java.time.Instant
import java.time.OffsetDateTime
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Testcontainers
@AutoConfigureMockMvc
@ActiveProfiles("testing")
@SpringBootTest(classes = [IdentityServiceApplication::class])
class IdentitySecurityTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var users: IdentityRepository

    @Autowired lateinit var passkeys: PasskeyRepository

    @Autowired lateinit var passwords: PasswordEncoder

    @Autowired lateinit var auth: AuthService

    @Autowired lateinit var accounts: AccountService

    @Autowired lateinit var mfa: MfaService

    @Autowired lateinit var oauth: OAuthRepository

    @Autowired lateinit var oauthService: McpOAuthService

    @Autowired lateinit var keys: McpKeyService

    @Autowired lateinit var transactions: PlatformTransactionManager

    @MockBean lateinit var audit: AuditClient

    @MockBean lateinit var mail: OutboundMailer

    @Test
    fun passwordCannotBypassAnExistingPasskeyOrBootstrapAnotherFactor() {
        for (role in listOf("viewer", "admin")) {
            val user = user(role)
            // This path only inspects enrollment state; no WebAuthn assertion is being forged.
            passkeys.insert(user, UUID.randomUUID().toString().toByteArray(), byteArrayOf(1), 0, "Existing passkey")
            val response = loginResponse(user)
            assertThat(response.path("token").isMissingNode).isTrue()
            assertThat(response.path("mfaRequired").asBoolean()).isTrue()
            assertThat(response.path("mfaEnrollmentRequired").asBoolean()).isFalse()
            val challenge = response.path("challengeToken").asText()
            post("/mfa/enroll/start", mapOf("challengeToken" to challenge), expected = 401)
            post("/passkeys/enroll/login/start", mapOf("challengeToken" to challenge), expected = 401)
        }
    }

    @Test
    fun promotingAPasswordOnlySessionCannotGrantPrivilegedAccess() {
        val user = user("viewer")
        val token = loginResponse(user).path("token").asText()
        accounts.updateRoles(admin(), user, listOf("admin"), "127.0.0.1", "security-test")
        mvc.get("/me") { header("Authorization", "Bearer $token") }.andExpect { status { isUnauthorized() } }
        mvc.get("/users") { header("Authorization", "Bearer $token") }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun importOAuthRequiresAnActualFreshSecondFactorForAnEditor() {
        val user = user("editor")
        val token = loginResponse(user).path("token").asText()
        val client = post("/oauth/register", mapOf("client_name" to "Security test", "redirect_uris" to listOf("http://127.0.0.1:47001/callback")), expected = 201)
        val request = mapOf(
            "client_id" to client.path("client_id").asText(),
            "redirect_uri" to "http://127.0.0.1:47001/callback",
            "resource" to "http://localhost/mcp",
            "response_type" to "code",
            "code_challenge" to "a".repeat(43),
            "code_challenge_method" to "S256",
            "scope" to "mcp:read ingestion:import",
        )
        post("/oauth/approve", request, token, 403)
        val start = post("/mfa/enroll/start", mapOf("password" to PASSWORD), token)
        val enrollment = post("/mfa/enroll/confirm", mapOf("challengeToken" to start.path("challengeToken").asText(), "code" to Totp.generate(start.path("secret").asText())), token)
        assertThat(enrollment.path("recoveryCodes").map { it.asText().replace("-", "").length }).allMatch { it >= 20 }
        post("/oauth/approve", request, token)
        jdbc.update("UPDATE sessions SET step_up_at = NOW() - INTERVAL '10 minutes' WHERE token_hash = ?", Tokens.sha256Hex(token))
        post("/oauth/approve", request, token, 403)
    }

    @Test
    fun disablingAnInvitationPreventsItsLinkFromActivatingTheAccount() {
        val user = user("viewer", enabled = false)
        val token = UUID.randomUUID().toString()
        users.insertInvite(user, Tokens.sha256Hex(token), Instant.now().plusSeconds(600))
        accounts.disable(admin(), user, "127.0.0.1", "security-test")
        post("/invites/accept", mapOf("token" to token, "password" to PASSWORD), expected = 400)
        assertThat(users.findUserById(user)!!.enabled).isFalse()
    }

    @Test
    fun passwordResetInvalidatesAnEarlierPasswordOnlyEnrollmentChallenge() {
        val user = user("admin")
        val challenge = loginResponse(user).path("challengeToken").asText()
        val token = UUID.randomUUID().toString()
        users.insertPasswordReset(user, Tokens.sha256Hex(token), Instant.now().plusSeconds(600))
        post("/password/reset/confirm", mapOf("token" to token, "newPassword" to "Another unique correct secret 2026!"), expected = 204)
        post("/mfa/enroll/start", mapOf("challengeToken" to challenge), expected = 401)
        post("/passkeys/enroll/login/start", mapOf("challengeToken" to challenge), expected = 401)
    }

    @Test
    fun inviteAndResetLinksHaveOnlyOneConcurrentConsumer() {
        for (invite in listOf(true, false)) {
            val user = user("viewer", enabled = !invite)
            val token = UUID.randomUUID().toString()
            if (invite) {
                users.insertInvite(user, Tokens.sha256Hex(token), Instant.now().plusSeconds(600))
            } else {
                users.insertPasswordReset(user, Tokens.sha256Hex(token), Instant.now().plusSeconds(600))
            }
            val pool = Executors.newFixedThreadPool(6)
            val start = CountDownLatch(1)
            try {
                val attempts = (1..6).map {
                    pool.submit<Boolean> {
                        check(start.await(5, TimeUnit.SECONDS))
                        try {
                            if (invite) {
                                accounts.acceptInvite(token, PASSWORD, "127.0.0.1", "security-test")
                            } else {
                                accounts.confirmPasswordReset(token, PASSWORD, "127.0.0.1", "security-test")
                            }
                            true
                        } catch (_: BadRequestException) {
                            false
                        }
                    }
                }
                start.countDown()
                assertThat(attempts.count { it.get(15, TimeUnit.SECONDS) }).isEqualTo(1)
            } finally {
                pool.shutdownNow()
                check(pool.awaitTermination(5, TimeUnit.SECONDS))
            }
        }
    }

    @Test
    fun aStolenSessionCannotEnrollTotpWithoutPasswordReauthentication() {
        val token = loginResponse(user("viewer")).path("token").asText()
        post("/mfa/enroll/start", emptyMap<String, String>(), token, 401)
        post("/mfa/enroll/start", mapOf("password" to PASSWORD), token)
    }

    @Test
    fun passwordReauthenticationHasASharedBudgetAcrossSensitiveEndpoints() {
        val token = loginResponse(user("viewer")).path("token").asText()
        repeat(5) { index ->
            if (index % 2 == 0) {
                post("/mfa/enroll/start", mapOf("password" to "wrong"), token, 401)
            } else {
                post("/password/change", mapOf("currentPassword" to "wrong", "newPassword" to PASSWORD), token, 401)
            }
        }
        post("/passkeys/enroll/start", mapOf("password" to PASSWORD), token, 429)
        post("/mfa/enroll/start", mapOf("password" to PASSWORD), token, 429)
    }

    @Test
    fun concurrentFailuresCannotLoseThrottleIncrements() {
        val key = "security-throttle:${UUID.randomUUID()}"
        val pool = Executors.newFixedThreadPool(6)
        val start = CountDownLatch(1)
        try {
            val attempts = (1..6).map {
                pool.submit {
                    check(start.await(5, TimeUnit.SECONDS))
                    repeat(10) { auth.recordLockedFailure(key) }
                }
            }
            start.countDown()
            attempts.forEach { it.get(10, TimeUnit.SECONDS) }
            assertThat(users.findThrottle(key)!!.failureCount).isEqualTo(60)
            assertThat(users.findThrottle(key)!!.lockedUntil).isAfter(Instant.now())
        } finally {
            pool.shutdownNow()
            check(pool.awaitTermination(5, TimeUnit.SECONDS))
        }
    }

    @Test
    fun resetRevokesPersonalKeysOAuthTokensAndPendingCodes() {
        val user = user("viewer")
        val token = loginResponse(user).path("token").asText()
        val key = post("/mcp-keys", mapOf("name" to "Personal", "scopes" to listOf("mcp:read")), token, 201).path("token").asText()
        val (_, grant) = oauthCode(user)
        val access = "ca_oauth_${UUID.randomUUID()}"
        oauth.storeToken(Tokens.sha256Hex(access), grant, OffsetDateTime.now().plusMinutes(15))
        for (credential in listOf(key, access)) {
            mvc.get("/me") { header("Authorization", "Bearer $credential") }.andExpect { status { isOk() } }
        }
        val reset = UUID.randomUUID().toString()
        users.insertPasswordReset(user, Tokens.sha256Hex(reset), Instant.now().plusSeconds(600))
        accounts.confirmPasswordReset(reset, PASSWORD, "127.0.0.1", "security-test")
        for (credential in listOf(key, access, token)) {
            mvc.get("/me") { header("Authorization", "Bearer $credential") }.andExpect { status { isUnauthorized() } }
        }
        assertThat(oauth.validCode(grant.codeHash)).isNull()
    }

    @Test
    fun resetWinsAgainstIssuanceWaitingOnTheOwnerLock() {
        for (redeem in listOf(false, true)) {
            val user = user("viewer")
            val token = loginResponse(user).path("token").asText()
            val (plaintext, code) = oauthCode(user)
            val reset = UUID.randomUUID().toString()
            users.insertPasswordReset(user, Tokens.sha256Hex(reset), Instant.now().plusSeconds(600))
            val pool = Executors.newSingleThreadExecutor()
            try {
                val result = TransactionTemplate(transactions).execute {
                    users.lockUser(user)
                    val holder = jdbc.queryForObject("SELECT pg_backend_pid()", Int::class.java)!!
                    val attempt = pool.submit<Boolean> {
                        try {
                            if (redeem) {
                                oauthService.redeem("authorization_code", plaintext, code.clientId.toString(), code.redirectUri, VERIFIER, code.resource)
                            } else {
                                keys.create("Bearer $token", CreateMcpKeyRequest("Concurrent", listOf("mcp:read")), "127.0.0.1", "security-test")
                            }
                            false
                        } catch (_: UnauthorizedException) {
                            true
                        }
                    }
                    awaitBlocked(holder)
                    accounts.confirmPasswordReset(reset, PASSWORD, "127.0.0.1", "security-test")
                    attempt
                }!!
                assertThat(result.get(10, TimeUnit.SECONDS)).isTrue()
                assertThat(jdbc.queryForObject("SELECT count(*) FROM mcp_keys WHERE owner_id = ? AND revoked_at IS NULL", Int::class.java, user)!!).isZero()
                assertThat(jdbc.queryForObject("SELECT count(*) FROM oauth_access_tokens WHERE owner_id = ? AND revoked_at IS NULL", Int::class.java, user)!!).isZero()
            } finally {
                pool.shutdownNow()
                check(pool.awaitTermination(5, TimeUnit.SECONDS))
            }
        }
    }

    @Test
    fun loginsQueuedBehindTheOwnerLockRespectTheNewLockout() {
        val user = user("viewer")
        val email = users.findUserById(user)!!.email
        val pool = Executors.newFixedThreadPool(6)
        try {
            val attempts = TransactionTemplate(transactions).execute {
                users.lockUser(user)
                val requests = (1..6).map {
                    pool.submit<Int> {
                        try {
                            auth.login(email, "wrong", "queued-$user", "security-test", null)
                            200
                        } catch (_: TooManyRequestsException) {
                            429
                        } catch (_: UnauthorizedException) {
                            401
                        }
                    }
                }
                awaitBlocked(null, 6)
                requests
            }!!
            val statuses = attempts.map { it.get(10, TimeUnit.SECONDS) }
            assertThat(statuses.count { it == 401 }).isEqualTo(5)
            assertThat(statuses.count { it == 429 }).isEqualTo(1)
            assertThat(users.findThrottle("email:$email")!!.failureCount).isEqualTo(5)
        } finally {
            pool.shutdownNow()
            check(pool.awaitTermination(5, TimeUnit.SECONDS))
        }
    }

    @Test
    fun passkeyStepUpChallengesAreBoundToTheAccountAndCannotBecomeLogins() {
        val owner = loginResponse(user("viewer")).path("token").asText()
        val other = loginResponse(user("viewer")).path("token").asText()
        post("/passkeys/step-up/start", emptyMap<String, String>(), expected = 401)
        val first = post("/passkeys/step-up/start", emptyMap<String, String>(), owner).path("challengeId").asText()
        post("/passkeys/step-up/finish", mapOf("challengeId" to first, "credential" to emptyMap<String, String>()), other, 401)
        val second = post("/passkeys/step-up/start", emptyMap<String, String>(), owner).path("challengeId").asText()
        post("/passkeys/login/finish", mapOf("challengeId" to second, "credential" to emptyMap<String, String>()), expected = 401)
    }

    private fun awaitBlocked(holder: Int?, minimum: Int = 1) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        var blocked = 0
        while (blocked < minimum && System.nanoTime() < deadline) {
            jdbc.execute("SELECT pg_stat_clear_snapshot()")
            blocked = if (holder == null) {
                jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'", Int::class.java)!!
            } else {
                jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid))", Int::class.java, holder)!!
            }
            if (blocked < minimum) Thread.sleep(10)
        }
        assertThat(blocked).withFailMessage("Expected %s requests waiting on owner locks; found %s", minimum, blocked).isGreaterThanOrEqualTo(minimum)
    }

    private fun oauthCode(user: UUID): Pair<String, OAuthCode> {
        val client = oauth.registerClient("Security fixture", listOf("http://127.0.0.1:47002/callback"))
        val plaintext = UUID.randomUUID().toString()
        val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(VERIFIER.toByteArray()))
        val code = OAuthCode(Tokens.sha256Hex(plaintext), client.id, user, client.redirectUris.single(), "http://localhost/mcp", listOf("mcp:read"), challenge)
        oauth.storeCode(code, OffsetDateTime.now().plusMinutes(5))
        return plaintext to code
    }

    private fun user(role: String, enabled: Boolean = true): UUID {
        val id = users.insertUser("security-${UUID.randomUUID()}@example.test", passwords.encode(PASSWORD), enabled)
        users.assignRole(id, users.findRoleId(role)!!)
        return id
    }

    private fun admin(): String {
        val id = user("admin")
        mfa.ensureSeedTotp(id, SECRET)
        val challenge = loginResponse(id).path("challengeToken").asText()
        val result = auth.completeMfaLogin(challenge, Totp.generate(SECRET), null, "127.0.0.1", "security-test")
        return "Bearer ${result.token}"
    }

    private fun loginResponse(userId: UUID): JsonNode =
        post("/login", mapOf("email" to users.findUserById(userId)!!.email, "password" to PASSWORD))

    private fun post(path: String, body: Any, token: String? = null, expected: Int = 200): JsonNode {
        val response = mvc.post(path) {
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(body)
            if (token != null) header("Authorization", "Bearer $token")
        }.andReturn().response
        assertThat(response.status).withFailMessage("%s returned %s: %s", path, response.status, response.contentAsString).isEqualTo(expected)
        return if (response.contentAsString.isBlank()) mapper.createObjectNode() else mapper.readTree(response.contentAsString)
    }

    companion object {
        private const val PASSWORD = "A unique correct secret 2026!"
        private const val SECRET = "CAATLASMFASEED22"
        private val VERIFIER = "v".repeat(43)

        @Container @JvmStatic
        val postgres = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("SETUP_FIXTURE_COMPLETE") { "true" }
            registry.add("identity.seed.mode") { "off" }
            registry.add("identity.mfa.encryption-key") { "security-test-key" }
        }
    }
}

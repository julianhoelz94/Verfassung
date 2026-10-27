import com.constitutionatlas.identity.IdentityServiceApplication
import com.constitutionatlas.identity.client.AuditClient
import com.constitutionatlas.identity.client.AuthAudit
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.crypto.Totp
import com.constitutionatlas.identity.mail.OutboundMailer
import com.constitutionatlas.identity.repo.ContentTranslationRepository
import com.constitutionatlas.identity.service.AccountService
import com.constitutionatlas.identity.service.IdentitySeedRunner
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.json.JsonMapper
import java.io.File
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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
    lateinit var contentTranslationRepository: ContentTranslationRepository

    @Autowired
    lateinit var identitySeedRunner: IdentitySeedRunner

    @Autowired
    lateinit var accountService: AccountService

    @Autowired
    lateinit var mfaService: com.constitutionatlas.identity.service.MfaService

    @Autowired
    lateinit var authAudit: AuthAudit

    @MockitoBean
    lateinit var auditClient: AuditClient

    @MockitoBean
    lateinit var outboundMailer: OutboundMailer

    private val objectMapper = JsonMapper()

    @Test
    fun recoveryCodeHasExactlyOneWinnerUnderConcurrentUse() {
        val userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", UUID::class.java, "local-viewer@example.local")!!
        val code = "RACE" + UUID.randomUUID().toString().replace("-", "").uppercase()
        val hash = Tokens.sha256Hex(code.lowercase())
        jdbcTemplate.update("INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)", UUID.randomUUID(), userId, hash)
        val pool = Executors.newFixedThreadPool(8)
        val start = CountDownLatch(1)
        try {
            val attempts = (1..8).map {
                pool.submit<Boolean> {
                    check(start.await(5, TimeUnit.SECONDS))
                    mfaService.useRecoveryCode(userId, code, "127.0.0.1", "concurrent-test", "local-viewer@example.local")
                }
            }
            start.countDown()
            check(attempts.count { it.get(10, TimeUnit.SECONDS) } == 1)
            check(!mfaService.useRecoveryCode(userId, code, "127.0.0.1", "replay-test", "local-viewer@example.local"))
        } finally {
            pool.shutdownNow()
            check(pool.awaitTermination(5, TimeUnit.SECONDS))
            jdbcTemplate.update("DELETE FROM mfa_recovery_codes WHERE code_hash = ?", hash)
        }
    }

    @Test
    fun personalGoogleKeyIsStoredEncryptedAndSharedQuotaHasAHardCap() {
        val viewer = login("local-viewer@example.local", "change-me")
        try {
            mockMvc.put("/content-translation/me") {
                header("Authorization", "Bearer $viewer")
                contentType = MediaType.APPLICATION_JSON
                content = """{"alwaysTranslate":true,"personalGoogleKey":"personal-test-key-123456"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.alwaysTranslate") { value(true) }
                jsonPath("$.personalGoogleKeyConfigured") { value(true) }
            }
            val cipher = jdbcTemplate.queryForObject(
                "SELECT google_key_cipher FROM user_content_translation_settings WHERE user_id = (SELECT id FROM users WHERE email = ?)",
                String::class.java,
                "local-viewer@example.local",
            )
            check(cipher != null && !cipher.contains("personal-test-key-123456"))
            check(contentTranslationRepository.reserveSharedGoogle("2099-12", 499_999))
            check(!contentTranslationRepository.reserveSharedGoogle("2099-12", 2))
        } finally {
            jdbcTemplate.update("DELETE FROM content_translation_google_reservations")
            jdbcTemplate.update("DELETE FROM content_translation_google_usage WHERE billing_month = '2099-12'")
            jdbcTemplate.update("DELETE FROM user_content_translation_settings WHERE user_id = (SELECT id FROM users WHERE email = ?)", "local-viewer@example.local")
        }
    }

    @Test
    fun anonymousBrowsingSettingsKeepSavedPositiveLimitsWhenDisabled() {
        val admin = login("local-admin@example.local", "change-me")
        val viewer = login("local-viewer@example.local", "change-me")
        val enabled = """{"allowed":true,"perIp":{"requests":3,"windowValue":2,"windowUnit":"hours"},"total":{"requests":5,"windowValue":1,"windowUnit":"days"}}"""
        val disabled = enabled.replace("\"allowed\":true", "\"allowed\":false")
        try {
            mockMvc.put("/admin/anonymous-browsing") {
                header("Authorization", "Bearer $viewer")
                contentType = MediaType.APPLICATION_JSON
                content = enabled
            }.andExpect { status { isForbidden() } }
            mockMvc.put("/admin/anonymous-browsing") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = enabled.replace("\"requests\":3", "\"requests\":0")
            }.andExpect { status { isBadRequest() } }
            mockMvc.put("/admin/anonymous-browsing") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = disabled
            }.andExpect { status { isOk() } }
            mockMvc.get("/anonymous-browsing").andExpect {
                status { isOk() }
                jsonPath("$.allowed") { value(false) }
                jsonPath("$.perIp.requests") { value(0) }
                jsonPath("$.total.requests") { value(0) }
            }
            mockMvc.get("/admin/anonymous-browsing") { header("Authorization", "Bearer $admin") }.andExpect {
                status { isOk() }
                jsonPath("$.perIp.requests") { value(3) }
                jsonPath("$.total.requests") { value(5) }
            }
            mockMvc.put("/admin/anonymous-browsing") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = enabled
            }.andExpect { status { isOk() } }
        } finally {
            jdbcTemplate.update("UPDATE anonymous_browsing_settings SET allowed = TRUE, per_ip_requests = 600, per_ip_window_value = 1, per_ip_window_unit = 'minutes', total_requests = 6000, total_window_value = 1, total_window_unit = 'minutes' WHERE id = TRUE")
        }
    }

    @Test
    fun registrationIsClosedByDefaultAndConfirmedAccountsRemainViewers() {
        val email = "new-registration-${System.nanoTime()}@example.test"
        mockMvc.get("/registration/status").andExpect {
            status { isOk() }
            jsonPath("$.enabled") { value(false) }
        }
        mockMvc.post("/registration") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email"}"""
        }.andExpect { status { isForbidden() } }
        val admin = login("local-admin@example.local", "change-me")
        val settings = """{"selfRegistrationEnabled":true,"mailEnabled":true,"mailFrom":"no-reply@example.test","mailFromName":"Test","mailPublicBaseUrl":"http://localhost","smtpHost":"smtp.example.test","smtpPort":587,"smtpUsername":"","smtpAuth":false,"smtpStarttls":true,"smtpSsl":false}"""
        try {
            mockMvc.put("/admin/settings") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = settings
            }.andExpect { status { isOk() } }
            mockMvc.get("/admin/settings") { header("Authorization", "Bearer $admin") }.andExpect {
                status { isOk() }
                jsonPath("$.selfRegistrationEnabled") { value(true) }
                jsonPath("$.smtpPasswordSet") { value(false) }
            }
            mockMvc.put("/admin/settings") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = settings.dropLast(1) + ",\"smtpPassword\":\"smtp-secret\"}"
            }.andExpect { status { isOk() } }
            mockMvc.get("/admin/settings") { header("Authorization", "Bearer $admin") }.andExpect {
                status { isOk() }
                jsonPath("$.smtpPasswordSet") { value(true) }
                jsonPath("$.smtpPassword") { doesNotExist() }
            }
            check(jdbcTemplate.queryForObject("SELECT smtp_password_cipher FROM identity_settings WHERE id = TRUE", String::class.java) != "smtp-secret")
            Mockito.`when`(outboundMailer.enabled).thenReturn(true)
            mockMvc.post("/registration") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email"}"""
            }.andExpect { status { isNoContent() } }
            val token = ArgumentCaptor.forClass(String::class.java)
            Mockito.verify(outboundMailer).sendRegistration(eqValue(email), token.capture() ?: "")
            mockMvc.post("/registration/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"token":"${token.value}","password":"Long unique registration password 2026"}"""
            }.andExpect { status { isNoContent() } }
            mockMvc.post("/registration/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"token":"${token.value}","password":"Long unique registration password 2026"}"""
            }.andExpect { status { isBadRequest() } }
            check(rolesFor(email) == listOf("viewer"))
            val viewer = login(email, "Long unique registration password 2026")
            mockMvc.put("/admin/settings") {
                header("Authorization", "Bearer $viewer")
                contentType = MediaType.APPLICATION_JSON
                content = settings
            }.andExpect { status { isForbidden() } }
            mockMvc.post("/admin/settings/test-mail") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"to":"arbitrary@example.test"}"""
            }.andExpect { status { isNoContent() } }
            Mockito.verify(outboundMailer).sendTest("arbitrary@example.test")
            Mockito.doThrow(com.constitutionatlas.identity.MailDeliveryException()).`when`(outboundMailer).sendTest("bad@example.test")
            mockMvc.post("/admin/settings/test-mail") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"to":"bad@example.test"}"""
            }.andExpect { status { isServiceUnavailable() } }
        } finally {
            jdbcTemplate.update("UPDATE identity_settings SET self_registration_enabled = FALSE WHERE id = TRUE")
        }
    }

    @Test
    fun passkeyChallengesRequireAuthenticationAndRejectInvalidResponses() {
        mockMvc.post("/passkeys/enroll/start") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"password":"change-me"}"""
        }.andExpect { status { isUnauthorized() } }
        val viewer = login("local-viewer@example.local", "change-me")
        val started = mockMvc.post("/passkeys/enroll/start") {
            header("Authorization", "Bearer $viewer")
            contentType = MediaType.APPLICATION_JSON
            content = """{"password":"change-me"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.options.publicKey.challenge") { exists() }
        }.andReturn().response.contentAsString
        val challengeId = objectMapper.readTree(started).get("challengeId").asText()
        val badResponse = """{"challengeId":"$challengeId","credential":{},"label":"Laptop"}"""
        mockMvc.post("/passkeys/enroll/finish") {
            header("Authorization", "Bearer $viewer")
            contentType = MediaType.APPLICATION_JSON
            content = badResponse
        }.andExpect { status { isBadRequest() } }
        mockMvc.post("/passkeys/enroll/finish") {
            header("Authorization", "Bearer $viewer")
            contentType = MediaType.APPLICATION_JSON
            content = badResponse
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun passkeyLoginStartsAreRateLimitedAndExpiredChallengesArePurged() {
        val ip = "198.51.100.55"
        repeat(5) {
            mockMvc.post("/passkeys/login/start") {
                header("X-Atlas-Client-IP", ip)
                header("X-Forwarded-For", "203.0.113.$it, $ip")
            }.andExpect { status { isOk() } }
        }
        mockMvc.post("/passkeys/login/start") {
            header("X-Atlas-Client-IP", ip)
            header("X-Forwarded-For", "203.0.113.99, $ip")
        }
            .andExpect { status { isTooManyRequests() } }
        jdbcTemplate.update("UPDATE passkey_challenges SET expires_at = NOW() - INTERVAL '1 second'")
        mockMvc.post("/passkeys/login/start") { header("X-Atlas-Client-IP", "198.51.100.56") }
            .andExpect { status { isOk() } }
        val expired = jdbcTemplate.queryForObject("SELECT count(*) FROM passkey_challenges WHERE expires_at < NOW()", Int::class.java)
        check(expired == 0)
    }

    @Test
    fun privilegedPasswordChallengeCanStartPasskeyEnrollmentAndRejectBadResponse() {
        val admin = login("local-admin@example.local", "change-me")
        val email = "passkey-publisher-${System.nanoTime()}@example.local"
        val invite = mockMvc.post("/users/invites") {
            header("Authorization", "Bearer $admin")
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email","roles":["publisher"]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val inviteToken = objectMapper.readTree(invite).get("inviteToken").asText()
        mockMvc.post("/invites/accept") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$inviteToken","password":"not-a-common-pass"}"""
        }.andExpect { status { isOk() } }
        val login = mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email","password":"not-a-common-pass"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.mfaEnrollmentRequired") { value(true) }
        }.andReturn().response.contentAsString
        val loginChallenge = objectMapper.readTree(login).get("challengeToken").asText()
        val started = mockMvc.post("/passkeys/enroll/login/start") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"challengeToken":"$loginChallenge"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.options.publicKey.challenge") { exists() }
        }.andReturn().response.contentAsString
        val challengeId = objectMapper.readTree(started).get("challengeId").asText()
        mockMvc.post("/passkeys/enroll/login/finish") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"challengeToken":"$loginChallenge","challengeId":"$challengeId","credential":{},"label":"Laptop"}"""
        }.andExpect { status { isBadRequest() } }
        mockMvc.post("/passkeys/enroll/login/finish") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"challengeToken":"$loginChallenge","challengeId":"$challengeId","credential":{},"label":"Laptop"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun oauthCodeIsPkceBoundSingleUseAndRevocable() {
        val registered = mockMvc.post("/oauth/register") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"client_name":"Test client","redirect_uris":["http://127.0.0.1:45001/callback"]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val clientId = objectMapper.readTree(registered).get("client_id").asText()
        val session = login("local-reviewer@example.local", "change-me")
        val verifier = "valid-verifier-for-mcp-oauth-that-is-long-enough-0001"
        val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        val approved = mockMvc.post("/oauth/approve") {
            contentType = MediaType.APPLICATION_JSON
            header("Authorization", "Bearer $session")
            content = """{"client_id":"$clientId","redirect_uri":"http://127.0.0.1:45001/callback","resource":"http://localhost/mcp","response_type":"code","code_challenge":"$challenge","code_challenge_method":"S256","scope":"mcp:read","state":"test-state"}"""
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val redirect = java.net.URI(objectMapper.readTree(approved).get("redirect_uri").asText())
        check(redirect.rawQuery.contains("state=test-state"))
        val code = redirect.rawQuery.split('&').first { it.startsWith("code=") }.substringAfter('=')
        mockMvc.post("/oauth/token") {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            param("grant_type", "authorization_code")
            param("code", code)
            param("client_id", clientId)
            param("redirect_uri", "http://127.0.0.1:45001/callback")
            param("resource", "http://localhost/mcp")
            param("code_verifier", "wrong-verifier-for-mcp-oauth-that-is-long-enough-0001")
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
        val exchanged = mockMvc.post("/oauth/token") {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            param("grant_type", "authorization_code")
            param("code", code)
            param("client_id", clientId)
            param("redirect_uri", "http://127.0.0.1:45001/callback")
            param("resource", "http://localhost/mcp")
            param("code_verifier", verifier)
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val access = objectMapper.readTree(exchanged).get("access_token").asText()
        mockMvc.post("/oauth/token") {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            param("grant_type", "authorization_code")
            param("code", code)
            param("client_id", clientId)
            param("redirect_uri", "http://127.0.0.1:45001/callback")
            param("resource", "http://localhost/mcp")
            param("code_verifier", verifier)
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
        mockMvc.get("/me") { header("Authorization", "Bearer $access") }.andExpect {
            status { isOk() }
            jsonPath("$.resource") { value("http://localhost/mcp") }
            jsonPath("$.scopes[0]") { value("mcp:read") }
        }
        mockMvc.get("/oauth/grants") { header("Authorization", "Bearer $session") }.andExpect {
            status { isOk() }
            jsonPath("$[0].clientId") { value(clientId) }
            jsonPath("$[0].redirectUris[0]") { value("http://127.0.0.1:45001/callback") }
        }
        val pendingApproval = mockMvc.post("/oauth/approve") {
            contentType = MediaType.APPLICATION_JSON
            header("Authorization", "Bearer $session")
            content = """{"client_id":"$clientId","redirect_uri":"http://127.0.0.1:45001/callback","resource":"http://localhost/mcp","response_type":"code","code_challenge":"$challenge","code_challenge_method":"S256","scope":"mcp:read"}"""
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val pendingCode = java.net.URI(objectMapper.readTree(pendingApproval).get("redirect_uri").asText()).rawQuery.substringAfter("code=").substringBefore('&')
        mockMvc.delete("/oauth/grants/$clientId") { header("Authorization", "Bearer $session") }.andExpect { status { isNoContent() } }
        mockMvc.get("/me") { header("Authorization", "Bearer $access") }.andExpect { status { isUnauthorized() } }
        mockMvc.post("/oauth/token") {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            param("grant_type", "authorization_code")
            param("code", pendingCode)
            param("client_id", clientId)
            param("redirect_uri", "http://127.0.0.1:45001/callback")
            param("resource", "http://localhost/mcp")
            param("code_verifier", verifier)
        }.andExpect { status { isBadRequest() } }
        mockMvc.post("/oauth/revoke") {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            param("token", access)
        }.andExpect { status { isOk() } }
    }

    @Test
    fun oauthRegistrationIsLimitedPerPeer() {
        repeat(20) { index ->
            mockMvc.post("/oauth/register") {
                header("X-Atlas-Client-IP", "192.0.2.101")
                contentType = MediaType.APPLICATION_JSON
                content = """{"client_name":"Quota client $index","redirect_uris":["http://127.0.0.1:45001/callback"]}"""
            }.andExpect { status { isCreated() } }
        }
        mockMvc.post("/oauth/register") {
            header("X-Atlas-Client-IP", "192.0.2.101")
            contentType = MediaType.APPLICATION_JSON
            content = """{"client_name":"Over quota","redirect_uris":["http://127.0.0.1:45001/callback"]}"""
        }.andExpect { status { isTooManyRequests() } }
    }

    @Test
    fun oauthRejectsUnregisteredRedirectAndReviewerImportScope() {
        mockMvc.post("/oauth/register") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"client_name":"Bad redirect","redirect_uris":["http://evil.example/callback"]}"""
        }.andExpect { status { isBadRequest() } }
        val registered = mockMvc.post("/oauth/register") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"client_name":"Scoped client","redirect_uris":["http://127.0.0.1:45002/callback"]}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val clientId = objectMapper.readTree(registered).get("client_id").asText()
        val session = login("local-reviewer@example.local", "change-me")
        val payload = """{"client_id":"$clientId","redirect_uri":"http://127.0.0.1:45002/callback","resource":"http://localhost/mcp","response_type":"code","code_challenge":"${"a".repeat(43)}","code_challenge_method":"S256","scope":"mcp:read ingestion:import"}"""
        mockMvc.post("/oauth/approve") {
            contentType = MediaType.APPLICATION_JSON
            header("Authorization", "Bearer $session")
            content = payload
        }.andExpect { status { isForbidden() } }
        mockMvc.post("/oauth/approve") {
            contentType = MediaType.APPLICATION_JSON
            header("Authorization", "Bearer $session")
            content = payload.replace("45002", "45003").replace("ingestion:import", "")
        }.andExpect { status { isBadRequest() } }
    }

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
    fun languagePreferencePersistsAcrossSessionsAndRejectsUnsupportedValues() {
        val first = login("local-viewer@example.local", "change-me")
        try {
            mockMvc.put("/me/language") {
                header("Authorization", "Bearer $first")
                contentType = MediaType.APPLICATION_JSON
                content = """{"languagePreference":"de"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.languagePreference") { value("de") }
            }
            mockMvc.put("/me/language") {
                header("Authorization", "Bearer $first")
                contentType = MediaType.APPLICATION_JSON
                content = """{"languagePreference":"fr"}"""
            }.andExpect { status { isBadRequest() } }
            val second = login("local-viewer@example.local", "change-me")
            mockMvc.get("/me") { header("Authorization", "Bearer $second") }.andExpect {
                jsonPath("$.languagePreference") { value("de") }
            }
        } finally {
            jdbcTemplate.update("UPDATE users SET language_preference = 'auto' WHERE email = ?", "local-viewer@example.local")
        }
    }

    @Test
    fun loginReturnsExpiresInSecondsAndRotatesPreviousSession() {
        val first = login("local-editor@example.local", "change-me")
        check(first.length >= 43)
        check(!first.contains("-") || first.length != 36)
        val challengeJson =
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                header("Authorization", "Bearer $first")
                content = """{"email":"local-editor@example.local","password":"change-me"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.mfaRequired") { value(true) }
                jsonPath("$.challengeToken") { exists() }
            }.andReturn().response.contentAsString
        val challenge = objectMapper.readTree(challengeJson).get("challengeToken").asText()
        val second = completeMfa(challenge)
        mockMvc.get("/me") {
            header("Authorization", "Bearer $first")
        }.andExpect { status { isUnauthorized() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $second")
        }.andExpect {
            status { isOk() }
            jsonPath("$.mfaEnabled") { value(true) }
            jsonPath("$.stepUpFresh") { value(true) }
        }
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
                header("X-Atlas-Client-IP", "198.51.100.10")
                content = """{"email":"missing@example.local","password":"wrong"}"""
            }.andExpect { status { isUnauthorized() } }.andReturn().response.contentAsString
        val bad =
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Atlas-Client-IP", "198.51.100.11")
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
                header("X-Atlas-Client-IP", "203.0.113.50")
                content = """{"email":"locked-user@example.local","password":"wrong"}"""
            }.andExpect { status { isUnauthorized() } }
        }
        mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            header("X-Atlas-Client-IP", "203.0.113.50")
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
            jsonPath("$.paths./service-tokens.post") { exists() }
            jsonPath("$.paths./password/reset.post") { exists() }
            jsonPath("$.paths./login/mfa.post") { exists() }
            jsonPath("$.paths./mfa/enroll/start.post") { exists() }
            jsonPath("$.paths./mfa/step-up.post") { exists() }
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
        check(actual.path("scopes").isMissingNode || actual.get("scopes").size() == 0)
    }

    @Test
    fun adminCanIssueAndRevokeServiceTokenForMe() {
        val admin = login("local-admin@example.local", "change-me")
        val createdJson =
            mockMvc.post("/service-tokens") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"ingestion-ci","scopes":["catalog:write","content:write","ingestion:import"]}"""
            }.andExpect {
                status { isCreated() }
                jsonPath("$.token") { exists() }
                jsonPath("$.scopes.length()") { value(3) }
            }.andReturn().response.contentAsString
        val token = objectMapper.readTree(createdJson).get("token").asText()
        val tokenId = objectMapper.readTree(createdJson).get("id").asText()
        mockMvc.get("/me") {
            header("Authorization", "Bearer $token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.email") { value("service:ingestion-ci") }
            jsonPath("$.scopes[0]") { value("catalog:write") }
            jsonPath("$.roles.length()") { value(0) }
        }
        mockMvc.get("/service-tokens") {
            header("Authorization", "Bearer $admin")
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].name") { value("ingestion-ci") }
            jsonPath("$[0].token") { doesNotExist() }
            jsonPath("$[0].expiresAt") { exists() }
        }
        mockMvc.delete("/service-tokens/$tokenId") {
            header("Authorization", "Bearer $admin")
        }.andExpect { status { isNoContent() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun managedIngestionCredentialsAuthenticateWithOnlyTheirOwnScopeAndRotate() {
        val users = com.constitutionatlas.identity.repo.IdentityRepository(jdbcTemplate)
        val setup = com.constitutionatlas.identity.setup.SetupRepository(jdbcTemplate)
        val originalUsers = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Int::class.java)
        val values = List(3) { UUID.randomUUID().toString().replace("-", "").repeat(2) }
        fun register(publish: String) = com.constitutionatlas.identity.service.IngestionCredentialBootstrap(users, setup, publish, values[1], values[2]).run(DefaultApplicationArguments())
        register(values[0])
        register(values[0])
        for ((index, scope) in listOf("ingestion:publish", "audit:append", "search:reindex").withIndex()) {
            mockMvc.get("/me") { header("Authorization", "Bearer ${values[index]}") }.andExpect {
                status { isOk() }
                jsonPath("$.scopes.length()") { value(1) }
                jsonPath("$.scopes[0]") { value(scope) }
                jsonPath("$.roles.length()") { value(0) }
            }
        }
        check(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM service_tokens WHERE name LIKE 'managed-ingestion-%' AND revoked_at IS NULL", Int::class.java) == 3)
        val rotated = UUID.randomUUID().toString().replace("-", "").repeat(2)
        register(rotated)
        mockMvc.get("/me") { header("Authorization", "Bearer ${values[0]}") }.andExpect { status { isUnauthorized() } }
        mockMvc.get("/me") { header("Authorization", "Bearer $rotated") }.andExpect {
            status { isOk() }
            jsonPath("$.scopes[0]") { value("ingestion:publish") }
        }
        check(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Int::class.java) == originalUsers)
    }

    @Test
    fun personalMcpKeysAreScopedAndCanBeRotatedAndRevoked() {
        val viewer = login("local-viewer@example.local", "change-me")
        mockMvc.post("/mcp-keys") {
            header("Authorization", "Bearer $viewer")
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"unusable-import-only","scopes":["ingestion:import"]}"""
        }.andExpect { status { isBadRequest() } }
        mockMvc.post("/mcp-keys") {
            header("Authorization", "Bearer $viewer")
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"viewer-import","scopes":["mcp:read","ingestion:import"]}"""
        }.andExpect { status { isForbidden() } }
        val created = objectMapper.readTree(
            mockMvc.post("/mcp-keys") {
                header("Authorization", "Bearer $viewer")
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"viewer-read","scopes":["mcp:read"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )
        val id = created.path("key").path("id").asText()
        val first = created.path("token").asText()
        check(first.startsWith("ca_mcp_"))
        mockMvc.get("/me") { header("Authorization", "Bearer $first") }.andExpect {
            status { isOk() }
            jsonPath("$.roles.length()") { value(0) }
            jsonPath("$.scopes[0]") { value("mcp:read") }
        }
        val second = objectMapper.readTree(
            mockMvc.post("/mcp-keys/$id/rotate") {
                header("Authorization", "Bearer $viewer")
            }.andExpect { status { isOk() } }.andReturn().response.contentAsString,
        ).path("token").asText()
        mockMvc.get("/me") { header("Authorization", "Bearer $first") }.andExpect { status { isUnauthorized() } }
        mockMvc.delete("/mcp-keys/$id") { header("Authorization", "Bearer $viewer") }.andExpect { status { isNoContent() } }
        mockMvc.get("/me") { header("Authorization", "Bearer $second") }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun editorImportMcpKeyDoesNotInheritEditorRole() {
        val editor = login("local-editor@example.local", "change-me")
        val created = objectMapper.readTree(
            mockMvc.post("/mcp-keys") {
                header("Authorization", "Bearer $editor")
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"editor-import-${java.util.UUID.randomUUID()}","scopes":["mcp:read","ingestion:import"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
        )
        val token = created.path("token").asText()
        mockMvc.get("/me") { header("Authorization", "Bearer $token") }.andExpect {
            status { isOk() }
            jsonPath("$.roles.length()") { value(0) }
            jsonPath("$.scopes[1]") { value("ingestion:import") }
        }
    }

    @Test
    fun expiredServiceTokenCannotCallMe() {
        val admin = login("local-admin@example.local", "change-me")
        val createdJson =
            mockMvc.post("/service-tokens") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"expired-ci","scopes":["audit:read"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val tree = objectMapper.readTree(createdJson)
        val token = tree.get("token").asText()
        val tokenId = tree.get("id").asText()
        jdbcTemplate.update("UPDATE service_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ?::uuid", tokenId)
        mockMvc.get("/me") {
            header("Authorization", "Bearer $token")
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun adminCanRotateServiceToken() {
        val admin = login("local-admin@example.local", "change-me")
        val createdJson =
            mockMvc.post("/service-tokens") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"rotate-ci","scopes":["audit:append"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val created = objectMapper.readTree(createdJson)
        val oldToken = created.get("token").asText()
        val tokenId = created.get("id").asText()
        val rotatedJson =
            mockMvc.post("/service-tokens/$tokenId/rotate") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = "{}"
            }.andExpect {
                status { isOk() }
                jsonPath("$.token") { exists() }
                jsonPath("$.expiresAt") { exists() }
            }.andReturn().response.contentAsString
        val newToken = objectMapper.readTree(rotatedJson).get("token").asText()
        mockMvc.get("/me") {
            header("Authorization", "Bearer $oldToken")
        }.andExpect { status { isUnauthorized() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $newToken")
        }.andExpect {
            status { isOk() }
            jsonPath("$.email") { value("service:rotate-ci") }
        }
    }

    @Test
    fun serviceTokenIssueRequiresAdminAndBearer() {
        mockMvc.post("/service-tokens") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"nope","scopes":["audit:append"]}"""
        }.andExpect { status { isUnauthorized() } }
        val viewer = login("local-viewer@example.local", "change-me")
        mockMvc.post("/service-tokens") {
            header("Authorization", "Bearer $viewer")
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"nope","scopes":["audit:append"]}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun badPasswordIsUnauthorized() {
        mockMvc.post("/login") {
            contentType = MediaType.APPLICATION_JSON
            header("X-Atlas-Client-IP", "198.51.100.12")
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
        val firstSession = login(email, "not-a-common-pass")
        val currentSession = login(email, "not-a-common-pass")
        mockMvc.post("/password/change") {
            header("Authorization", "Bearer $currentSession")
            contentType = MediaType.APPLICATION_JSON
            content = """{"currentPassword":"not-a-common-pass","newPassword":"fresh-stable-phrase"}"""
        }.andExpect { status { isNoContent() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $firstSession")
        }.andExpect { status { isUnauthorized() } }
        mockMvc.get("/me") {
            header("Authorization", "Bearer $currentSession")
        }.andExpect { status { isOk() } }
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

    @Test
    fun inviteAndPasswordResetSendMail() {
        val admin = login("local-admin@example.local", "change-me")
        val email = "mailed-${System.nanoTime()}@example.local"
        val created =
            mockMvc.post("/users/invites") {
                header("Authorization", "Bearer $admin")
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email","roles":["viewer"]}"""
            }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val inviteToken = Regex("\"inviteToken\":\"([^\"]+)\"").find(created)!!.groupValues[1]
        Mockito.verify(outboundMailer).sendInvite(eqValue(email), anyStr())
        mockMvc.post("/invites/accept") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"token":"$inviteToken","password":"not-a-common-pass"}"""
        }.andExpect { status { isOk() } }
        mockMvc.post("/password/reset") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email"}"""
        }.andExpect { status { isNoContent() } }
        Mockito.verify(outboundMailer).sendPasswordReset(eqValue(email), anyStr())
        mockMvc.post("/password/reset") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"missing-${System.nanoTime()}@example.local"}"""
        }.andExpect { status { isNoContent() } }
        Mockito.verify(outboundMailer, Mockito.times(1)).sendPasswordReset(anyStr(), anyStr())
    }

    @Test
    fun privilegedLoginRequiresTotpAndStepUpForRoleChanges() {
        val challengeJson =
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"local-admin@example.local","password":"change-me"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.mfaRequired") { value(true) }
                jsonPath("$.token") { doesNotExist() }
            }.andReturn().response.contentAsString
        mockMvc.post("/login/mfa") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"challengeToken":"${objectMapper.readTree(challengeJson).get("challengeToken").asText()}","code":"000000"}"""
        }.andExpect { status { isUnauthorized() } }
        val admin = login("local-admin@example.local", "change-me")
        mockMvc.delete("/mfa") {
            header("Authorization", "Bearer $admin")
            contentType = MediaType.APPLICATION_JSON
            content = """{"code":"${Totp.generate(SEED_TOTP)}"}"""
        }.andExpect { status { isConflict() } }
        jdbcTemplate.update("UPDATE sessions SET step_up_at = NOW() - INTERVAL '10 minutes'")
        val target =
            mockMvc.get("/users") {
                header("Authorization", "Bearer $admin")
            }.andExpect { status { isOk() } }.andReturn().response.contentAsString.let { body ->
                objectMapper.readTree(body).first { it.get("email").asText() == "local-viewer@example.local" }.get("id").asText()
            }
        mockMvc.put("/users/$target/roles") {
            header("Authorization", "Bearer $admin")
            contentType = MediaType.APPLICATION_JSON
            content = """{"roles":["viewer"]}"""
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("step_up_required") }
        }
        mockMvc.post("/mfa/step-up") {
            header("Authorization", "Bearer $admin")
            contentType = MediaType.APPLICATION_JSON
            content = """{"code":"${Totp.generate(SEED_TOTP)}"}"""
        }.andExpect { status { isNoContent() } }
        mockMvc.put("/users/$target/roles") {
            header("Authorization", "Bearer $admin")
            contentType = MediaType.APPLICATION_JSON
            content = """{"roles":["viewer"]}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun totpEnrollmentRecoveryAndRevocationAreAudited() {
        val viewer = login("local-viewer@example.local", "change-me")
        val started =
            mockMvc.post("/mfa/enroll/start") {
                header("Authorization", "Bearer $viewer")
                contentType = MediaType.APPLICATION_JSON
                content = """{"password":"change-me"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.secret") { exists() }
                jsonPath("$.otpauthUrl") { exists() }
                jsonPath("$.challengeToken") { exists() }
            }.andReturn().response.contentAsString
        val startTree = objectMapper.readTree(started)
        val secret = startTree.get("secret").asText()
        val enrollToken = startTree.get("challengeToken").asText()
        mockMvc.post("/mfa/enroll/start") {
            header("Authorization", "Bearer $viewer")
            contentType = MediaType.APPLICATION_JSON
            content = """{"challengeToken":"$enrollToken"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.secret") { value(secret) }
            jsonPath("$.challengeToken") { value(enrollToken) }
        }
        val confirmed =
            mockMvc.post("/mfa/enroll/confirm") {
                header("Authorization", "Bearer $viewer")
                contentType = MediaType.APPLICATION_JSON
                content = """{"challengeToken":"$enrollToken","code":"${Totp.generate(secret)}"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.recoveryCodes.length()") { value(10) }
            }.andReturn().response.contentAsString
        mockMvc.post("/mfa/enroll/start") {
            header("Authorization", "Bearer $viewer")
            contentType = MediaType.APPLICATION_JSON
            content = """{"password":"change-me"}"""
        }.andExpect { status { isConflict() } }
        val recoveryCode = objectMapper.readTree(confirmed).get("recoveryCodes").get(0).asText()
        mockMvc.post("/logout") {
            header("Authorization", "Bearer $viewer")
        }.andExpect { status { isNoContent() } }
        val challengeJson =
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"local-viewer@example.local","password":"change-me"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.mfaRequired") { value(true) }
            }.andReturn().response.contentAsString
        val recovered =
            mockMvc.post("/login/mfa") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"challengeToken":"${objectMapper.readTree(challengeJson).get("challengeToken").asText()}","recoveryCode":"$recoveryCode"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.token") { exists() }
            }.andReturn().response.contentAsString
        val recoveredToken = objectMapper.readTree(recovered).get("token").asText()
        check(Mockito.mockingDetails(auditClient).invocations.any { it.arguments[0] == "mfa_changed" })
        mockMvc.delete("/mfa") {
            header("Authorization", "Bearer $recoveredToken")
            contentType = MediaType.APPLICATION_JSON
            content = """{"code":"${Totp.generate(secret)}"}"""
        }.andExpect { status { isNoContent() } }
        login("local-viewer@example.local", "change-me")
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
        ).map { checkNotNull(it) }

    private fun login(email: String, password: String): String {
        val json =
            mockMvc.post("/login") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"email":"$email","password":"$password"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.user.email") { value(email) }
            }.andReturn().response.contentAsString
        val tree = objectMapper.readTree(json)
        if (tree.path("mfaRequired").asBoolean(false)) {
            return completeMfa(tree.get("challengeToken").asText())
        }
        val token = tree.path("token").asText("")
        check(token.isNotBlank()) { "expected a session token for $email" }
        return token
    }

    private fun completeMfa(challengeToken: String): String =
        mockMvc.post("/login/mfa") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"challengeToken":"$challengeToken","code":"${Totp.generate(SEED_TOTP)}"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.token") { exists() }
            jsonPath("$.expiresInSeconds") { exists() }
        }.andReturn().response.contentAsString.let {
            objectMapper.readTree(it).get("token").asText()
        }

    private fun <T> eqValue(value: T): T = Mockito.eq(value) ?: value

    private fun anyStr(): String = Mockito.any(String::class.java) ?: ""

    companion object {
        private const val SEED_TOTP = "CAATLASMFASEED22"

        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("SETUP_FIXTURE_COMPLETE") { "true" }
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
            registry.add("identity.seed.totp-secret") { SEED_TOTP }
            registry.add("identity.mfa.encryption-key") { "test-mfa-key" }
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

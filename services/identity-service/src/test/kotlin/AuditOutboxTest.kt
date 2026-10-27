import tools.jackson.databind.json.JsonMapper
import com.constitutionatlas.identity.IdentityServiceApplication
import com.constitutionatlas.identity.client.AuditClient
import com.constitutionatlas.identity.client.AuditDeliveryClient
import com.constitutionatlas.identity.client.AuditOutboxPublisher
import com.constitutionatlas.identity.repo.AuditOutboxRepository
import com.constitutionatlas.identity.repo.PendingAudit
import com.constitutionatlas.identity.service.AuthService
import com.constitutionatlas.platform.UnauthorizedException
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@ActiveProfiles("local-stack")
@SpringBootTest(classes = [IdentityServiceApplication::class], properties = ["SETUP_FIXTURE_COMPLETE=true", "identity.audit.poll-ms=3600000"])
class AuditOutboxTest {
    @Autowired lateinit var audit: AuditClient

    @Autowired lateinit var publisher: AuditOutboxPublisher

    @Autowired lateinit var outbox: AuditOutboxRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var auth: AuthService

    @Autowired lateinit var transactions: PlatformTransactionManager

    @Autowired lateinit var mockMvc: MockMvc

    @MockitoBean lateinit var delivery: AuditDeliveryClient

    @Test
    fun committedEventsSurviveDeliveryFailureAndPublisherRestartWithStableIdentity() {
        val entity = UUID.randomUUID()
        audit.record("roles_changed", "user", entity, entity, "audit-test@example.test", mapOf("roles" to listOf("editor")))
        val attempts = mutableListOf<PendingAudit>()
        Mockito.doAnswer { invocation ->
            attempts += invocation.getArgument<PendingAudit>(0)
            throw IllegalStateException("response lost after remote commit")
        }.`when`(delivery).deliver(anyAudit())
        publisher.processDue()
        check(attempts.any { it.body.path("entityId").asText() == entity.toString() })
        val first = attempts.first { it.body.path("entityId").asText() == entity.toString() }
        check(jdbc.queryForObject("SELECT delivered_at IS NULL AND attempt_count = 1 FROM security_audit_outbox WHERE id = ?", Boolean::class.java, first.eventId) == true)
        jdbc.update("UPDATE security_audit_outbox SET next_attempt_at = clock_timestamp() WHERE id = ?", first.eventId)
        Mockito.doAnswer { invocation ->
            attempts += invocation.getArgument<PendingAudit>(0)
            null
        }.`when`(delivery).deliver(anyAudit())
        AuditOutboxPublisher(outbox, delivery, transactions).processDue()
        val retried = attempts.filter { it.eventId == first.eventId }
        check(retried.size == 2 && retried[0] == retried[1])
        check(jdbc.queryForObject("SELECT delivered_at IS NOT NULL AND last_error IS NULL FROM security_audit_outbox WHERE id = ?", Boolean::class.java, first.eventId) == true)
    }

    @Test
    fun rolledBackAccountMutationDoesNotLeaveAnAuditEvent() {
        val user = jdbc.queryForObject("SELECT id FROM users WHERE email = 'local-viewer@example.local'", UUID::class.java)!!
        val marker = UUID.randomUUID().toString()
        assertThrows(IllegalStateException::class.java) {
            TransactionTemplate(transactions).execute {
                jdbc.update("UPDATE users SET enabled = false WHERE id = ?", user)
                audit.record("account_disabled", "user", user, user, "local-viewer@example.local", mapOf("test" to marker))
                throw IllegalStateException("abort account transaction")
            }
        }
        check(jdbc.queryForObject("SELECT enabled FROM users WHERE id = ?", Boolean::class.java, user) == true)
        check(jdbc.queryForObject("SELECT COUNT(*) FROM security_audit_outbox WHERE body->'payload'->>'test' = ?", Int::class.java, marker) == 0)
    }

    @Test
    fun failedAuthenticationStillCommitsItsAuditEventAndMonitoringIsProtected() {
        val before = jdbc.queryForObject("SELECT COUNT(*) FROM security_audit_outbox WHERE body->>'action' = 'login_failed'", Int::class.java)!!
        assertThrows(UnauthorizedException::class.java) {
            auth.login("local-viewer@example.local", "wrong-password", "192.0.2.44", "audit-test", null)
        }
        check(jdbc.queryForObject("SELECT COUNT(*) FROM security_audit_outbox WHERE body->>'action' = 'login_failed'", Int::class.java) == before + 1)
        mockMvc.get("/operations/status").andExpect { status { isUnauthorized() } }
        val viewer = auth.login("local-viewer@example.local", "change-me", "192.0.2.45", "audit-test", null).token!!
        mockMvc.get("/operations/status") { header("Authorization", "Bearer $viewer") }.andExpect { status { isForbidden() } }
        val token = "operations-" + UUID.randomUUID()
        jdbc.update("INSERT INTO service_tokens (id, name, token_hash, scopes, created_by, expires_at) SELECT ?, 'monitor', ?, ARRAY['operations:read'], id, NOW() + INTERVAL '1 day' FROM users WHERE email = 'local-admin@example.local'", UUID.randomUUID(), com.constitutionatlas.identity.crypto.Tokens.sha256Hex(token))
        mockMvc.get("/operations/status") { header("Authorization", "Bearer $token") }.andExpect {
            status { isOk() }
            jsonPath("$.service") { value("identity") }
            jsonPath("$.queues[0].name") { value("audit") }
            jsonPath("$.queues[0].pendingCount") { isNumber() }
            jsonPath("$.queues[0].body") { doesNotExist() }
        }
    }

    private fun anyAudit(): PendingAudit {
        Mockito.any(PendingAudit::class.java)
        return PendingAudit(UUID(0, 0), java.time.OffsetDateTime.now(), JsonMapper().createObjectNode())
    }

    companion object {
        @Container @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("identity.seed.admin-email") { "local-admin@example.local" }
            registry.add("identity.seed.admin-password") { "change-me" }
            registry.add("identity.seed.viewer-email") { "local-viewer@example.local" }
            registry.add("identity.seed.viewer-password") { "change-me" }
        }
    }
}

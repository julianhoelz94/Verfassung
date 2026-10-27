import com.constitutionatlas.editor.EditorServiceApplication
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.AuditDeliveryClient
import com.constitutionatlas.editor.repo.AuditOutboxRepository
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.PendingAudit
import com.constitutionatlas.editor.service.AuditOutboxPublisher
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.jdbc.core.JdbcTemplate
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
@SpringBootTest(classes = [EditorServiceApplication::class], properties = ["editor.audit.poll-ms=3600000", "editor.outbox.poll-ms=3600000"])
class AuditOutboxTest {
    @Autowired lateinit var audit: AuditClient

    @Autowired lateinit var outbox: AuditOutboxRepository

    @Autowired lateinit var editor: EditorRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var transactions: PlatformTransactionManager

    @Autowired lateinit var mockMvc: MockMvc

    @MockitoBean lateinit var delivery: AuditDeliveryClient

    @MockitoBean lateinit var identity: IdentityClient

    @Test
    fun auditRetriesKeepTheCommittedIdentityAndRollbackLeavesNothingQueued() {
        val actor = Actor(UUID.randomUUID(), "editor@example.test", listOf("editor"))
        val session = editor.insertSession(actor.id, UUID.randomUUID(), "editorial_correction")
        audit.record(actor, "draft_saved", "edit_session", session)
        val attempts = mutableListOf<PendingAudit>()
        val fail = AuditDeliveryClient { event ->
            attempts += event
            throw IllegalStateException("response lost")
        }
        AuditOutboxPublisher(outbox, fail, transactions).processDue()
        val event = attempts.single { it.body.path("entityId").asText() == session.toString() }
        check(jdbc.queryForObject("SELECT published_at IS NULL AND attempt_count = 1 FROM outbox_events WHERE id = ?", Boolean::class.java, event.eventId) == true)
        jdbc.update("UPDATE outbox_events SET next_attempt_at = clock_timestamp() WHERE id = ?", event.eventId)
        AuditOutboxPublisher(outbox, AuditDeliveryClient { attempts += it }, transactions).processDue()
        check(attempts.count { it == event } == 2)
        check(jdbc.queryForObject("SELECT published_at IS NOT NULL FROM outbox_events WHERE id = ?", Boolean::class.java, event.eventId) == true)

        var rolledBack: UUID? = null
        assertThrows(IllegalStateException::class.java) {
            TransactionTemplate(transactions).execute {
                val id = editor.insertSession(actor.id, UUID.randomUUID(), "editorial_correction")
                rolledBack = id
                audit.record(actor, "session_opened", "edit_session", id)
                throw IllegalStateException("abort")
            }
        }
        check(jdbc.queryForObject("SELECT COUNT(*) FROM outbox_events WHERE session_id = ?", Int::class.java, rolledBack) == 0)
        check(jdbc.queryForObject("SELECT COUNT(*) FROM edit_sessions WHERE id = ?", Int::class.java, rolledBack) == 0)
    }

    @Test
    fun operationalStatusAllowsOnlyAdminOrReadScopeAndDoesNotExposeAuditBodies() {
        Mockito.`when`(identity.authenticate(null)).thenThrow(UnauthorizedException("Missing token"))
        Mockito.`when`(identity.authenticate("Bearer viewer")).thenReturn(Actor(UUID.randomUUID(), "viewer@example.test", listOf("viewer")))
        Mockito.`when`(identity.authenticate("Bearer monitor")).thenReturn(Actor(UUID.randomUUID(), "service:monitor", emptyList(), listOf("operations:read")))
        mockMvc.get("/operations/status").andExpect { status { isUnauthorized() } }
        mockMvc.get("/operations/status") { header("Authorization", "Bearer viewer") }.andExpect { status { isForbidden() } }
        mockMvc.get("/operations/status") { header("Authorization", "Bearer monitor") }.andExpect {
            status { isOk() }
            jsonPath("$.service") { value("editor") }
            jsonPath("$.queues.length()") { value(3) }
            jsonPath("$.queues[0].name") { value("audit") }
            jsonPath("$.queues[0].pendingCount") { isNumber() }
            jsonPath("$.queues[0].body") { doesNotExist() }
        }
    }

    companion object {
        @Container @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

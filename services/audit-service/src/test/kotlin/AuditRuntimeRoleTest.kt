import com.constitutionatlas.audit.AuditServiceApplication
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.dao.DataAccessException
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [AuditServiceApplication::class])
class AuditRuntimeRoleTest {
    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var mockMvc: MockMvc

    @Autowired lateinit var flyway: Flyway

    @MockitoBean lateinit var identity: IdentityClient

    @Test
    fun upgradedDatabaseUsesRestrictedRuntimeWhileOwnerCanMigrate() {
        check(jdbc.queryForObject("SELECT current_user", String::class.java) == "audit_runtime")
        check(flyway.info().current().version.toString() == "4")
        check(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action = 'before_upgrade'", Int::class.java) == 1)
        val token = "Bearer runtime-role-test"
        Mockito.`when`(identity.authenticate(token)).thenReturn(Actor(UUID.randomUUID(), "service:runtime-test", emptyList(), listOf("audit:append")))
        mockMvc.post("/events") {
            header("Authorization", token)
            contentType = MediaType.APPLICATION_JSON
            content = """{"action":"runtime_append","entityType":"user","entityId":"${UUID.randomUUID()}"}"""
        }.andExpect { status { isCreated() } }
        check(jdbc.queryForObject("SELECT has_table_privilege(current_user, 'audit_events', 'UPDATE') OR has_table_privilege(current_user, 'audit_events', 'DELETE')", Boolean::class.java) == false)
        // Existing rules intentionally make these commands harmless no-ops before
        // PostgreSQL evaluates the missing runtime privileges.
        check(jdbc.update("UPDATE audit_events SET action = 'changed'") == 0)
        check(jdbc.update("DELETE FROM audit_events") == 0)
        check(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE action = 'before_upgrade'", Int::class.java) == 1)
        listOf(
            "TRUNCATE audit_events",
            "DROP TABLE audit_events",
            "ALTER TABLE audit_events DISABLE RULE audit_events_no_delete",
            "ALTER ROLE audit_runtime SUPERUSER",
            "CREATE TABLE forbidden_runtime_table (id int)",
        ).forEach { sql -> assertThrows(DataAccessException::class.java, { jdbc.execute(sql) }, sql) }
        check(jdbc.queryForObject("SELECT COUNT(*) FROM audit_events", Int::class.java) == 2)
        flyway.migrate()
    }

    companion object {
        private const val PASSWORD = "runtime-'quoted-secret"

        @Container @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).target("3").load().migrate()
            java.sql.DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
                connection.createStatement().use { it.execute("INSERT INTO audit_events(id,action,entity_type,entity_id) VALUES ('01900000-0000-4000-8000-000000009999','before_upgrade','user','01900000-0000-4000-8000-000000009998')") }
            }
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username") { "audit_runtime" }
            registry.add("spring.datasource.password") { PASSWORD }
            registry.add("spring.flyway.url", postgres::getJdbcUrl)
            registry.add("spring.flyway.user", postgres::getUsername)
            registry.add("spring.flyway.password", postgres::getPassword)
            registry.add("AUDIT_RUNTIME_PASSWORD") { PASSWORD }
        }
    }
}

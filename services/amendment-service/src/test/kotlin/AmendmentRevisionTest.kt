import com.constitutionatlas.amendment.AmendmentServiceApplication
import com.constitutionatlas.amendment.repo.AmendmentRepository
import com.constitutionatlas.amendment.repo.RevisionInsert
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.LocalDate
import java.util.UUID

@Testcontainers
@SpringBootTest(classes = [AmendmentServiceApplication::class])
class AmendmentRevisionTest {
    @Autowired
    lateinit var amendmentRepository: AmendmentRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun appendRevisionInLinearChainSucceeds() {
        val amendmentId = UUID.fromString("01900000-0000-4000-8000-000000000322")
        val firstRevisionId = UUID.fromString("01900000-0000-4000-8000-000000000332")
        val secondRevisionId = UUID.randomUUID()

        amendmentRepository.insertRevision(
            RevisionInsert(
                id = secondRevisionId,
                amendmentId = amendmentId,
                predecessorRevisionId = firstRevisionId,
                title = "Updated title",
                summary = "Second revision in chain",
                enactedOn = LocalDate.parse("2023-07-01"),
                effectiveOn = null,
                sourceReference = "BGBl. I 2023",
            ),
        )

        val count =
            jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM amendment_revisions
                WHERE amendment_id = ? AND predecessor_revision_id = ?
                """.trimIndent(),
                Int::class.java,
                amendmentId,
                firstRevisionId,
            )
        check(count == 1)
    }

    @Test
    fun secondChildOfSamePredecessorFails() {
        val amendmentId = UUID.randomUUID()
        val firstRevisionId = UUID.randomUUID()
        val branchRevisionId = UUID.randomUUID()

        jdbcTemplate.update(
            """
            INSERT INTO amendments (
              id, constitution_id, version_transition_id, title, summary, enacted_on, source_reference,
              kind, status
            )
            VALUES (?, ?, NULL, ?, ?, ?, ?, 'legal_amendment', 'published')
            """.trimIndent(),
            amendmentId,
            UUID.fromString("01900000-0000-4000-8000-000000000002"),
            "Test amendment",
            "For revision branching test",
            LocalDate.parse("2020-01-01"),
            null,
        )
        amendmentRepository.insertRevision(
            RevisionInsert(
                id = firstRevisionId,
                amendmentId = amendmentId,
                predecessorRevisionId = null,
                title = "First revision",
                summary = "Root",
                enactedOn = LocalDate.parse("2020-01-01"),
                effectiveOn = null,
                sourceReference = null,
            ),
        )
        jdbcTemplate.update(
            """
            UPDATE amendments SET published_revision_id = ? WHERE id = ?
            """.trimIndent(),
            firstRevisionId,
            amendmentId,
        )
        amendmentRepository.insertRevision(
            RevisionInsert(
                id = UUID.randomUUID(),
                amendmentId = amendmentId,
                predecessorRevisionId = firstRevisionId,
                title = "First child",
                summary = "Linear append",
                enactedOn = LocalDate.parse("2021-01-01"),
                effectiveOn = null,
                sourceReference = null,
            ),
        )

        assertThrows<DataIntegrityViolationException> {
            amendmentRepository.insertRevision(
                RevisionInsert(
                    id = branchRevisionId,
                    amendmentId = amendmentId,
                    predecessorRevisionId = firstRevisionId,
                    title = "Branch attempt",
                    summary = "Should fail uniqueness on predecessor",
                    enactedOn = LocalDate.parse("2024-01-01"),
                    effectiveOn = null,
                    sourceReference = null,
                ),
            )
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
        }
    }
}

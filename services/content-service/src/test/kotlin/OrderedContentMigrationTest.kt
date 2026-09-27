import com.constitutionatlas.content.repo.OrderedContentRepository
import org.assertj.core.api.Assertions.assertThat
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.MigrationVersion
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

@Testcontainers
class OrderedContentMigrationTest {
    @Test
    fun populatedLegacySnapshotBackfillsWithoutChangingAliasesOrBytes() {
        val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        Flyway.configure().dataSource(source).target(MigrationVersion.fromVersion("7")).load().migrate()
        val jdbc = JdbcTemplate(source)
        val version = UUID.randomUUID()
        val parent = UUID.randomUUID()
        val child = UUID.randomUUID()
        jdbc.update("INSERT INTO content_nodes(id, version_id, kind, label, title, body, sort_order) VALUES (?, ?, 'article', '46a', 'Rights', ?, 1)", parent, version, "  Parent\ntext.  ")
        jdbc.update("INSERT INTO content_nodes(id, version_id, parent_id, kind, label, body, sort_order) VALUES (?, ?, ?, 'sentence', 'bis', ?, 1)", child, version, parent, "Child text.")
        Flyway.configure().dataSource(source).load().migrate()
        assertThat(jdbc.queryForObject("SELECT revision_id FROM content_snapshot_roots WHERE version_id = ?", UUID::class.java, version)).isEqualTo(parent)
        assertThat(jdbc.queryForObject("SELECT order_inferred FROM content_node_revisions WHERE id = ?", Boolean::class.java, parent)).isTrue()
        assertThat(jdbc.queryForObject("SELECT t.text FROM content_revision_entries e JOIN content_text_revisions t ON t.id = e.text_revision_id WHERE e.parent_revision_id = ? AND e.position = 0", String::class.java, parent)).isEqualTo("  Parent\ntext.  ")
        assertThat(jdbc.queryForObject("SELECT child_revision_id FROM content_revision_entries WHERE parent_revision_id = ? AND position = 1", UUID::class.java, parent)).isEqualTo(child)
        assertThat(jdbc.queryForObject("SELECT node_revision_id FROM content_occurrences WHERE id = ?", UUID::class.java, child)).isEqualTo(child)
        assertThat(jdbc.queryForObject("SELECT body FROM content_nodes WHERE id = ?", String::class.java, parent)).isEqualTo("  Parent\ntext.  ")
        val repository = OrderedContentRepository(jdbc)
        val before = repository.snapshot(version)
        val textLogical = before.roots.single().content.first().logicalId
        jdbc.update("UPDATE content_nodes SET body = 'Edited parent.' WHERE id = ?", parent)
        repository.invalidateLegacy(version)
        repository.refreshLegacy(version)
        val after = repository.snapshot(version)
        assertThat(after.roots.single().content.first().logicalId).isEqualTo(textLogical)
        assertThat(after.roots.single().content.first().text).isEqualTo("Edited parent.")
        assertThat(after.roots.single().occurrenceId).isEqualTo(parent)
        assertThat(after.roots.single().content[1].node!!.occurrenceId).isEqualTo(child)
    }

    companion object {
        @Container @JvmStatic
        val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}

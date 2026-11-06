import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import java.security.MessageDigest
import java.util.UUID

/** Exercise the upgrade with real historical rows, rather than only an empty database. */
@Testcontainers
class DocumentLibraryMigrationTest {
    @Test
    fun upgradeBackfillsKeysAndDeduplicatesFilesWithoutChangingHistoricalBytes() {
        val datasource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        Flyway.configure().dataSource(datasource).target("9").load().migrate()
        val jdbc = JdbcTemplate(datasource)
        val documentId = UUID.randomUUID()
        val actorId = UUID.randomUUID()
        val revisionIds = listOf(UUID.randomUUID(), UUID.randomUUID())
        val bytes = "Historical UTF-8 source ä".toByteArray()
        jdbc.update("INSERT INTO documents (id, current_revision, created_by) VALUES (?, 2, ?)", documentId, actorId)
        revisionIds.forEachIndexed { index, revisionId ->
            jdbc.update(
                """INSERT INTO document_revisions (id, document_id, revision, title, file_name, content_type, file_bytes, created_by)
                   VALUES (?, ?, ?, ?, 'original.txt', 'text/plain', ?, ?)""",
                revisionId,
                documentId,
                index + 1,
                "Historical title ${index + 1}",
                bytes,
                actorId,
            )
        }
        Flyway.configure().dataSource(datasource).load().migrate()
        val key = "doc-$documentId"
        assertEquals(key, jdbc.queryForObject("SELECT citation_key FROM documents WHERE id = ?", String::class.java, documentId))
        assertEquals(documentId, jdbc.queryForObject("SELECT document_id FROM document_keys WHERE normalized_key = ?", UUID::class.java, key))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM document_files", Int::class.java))
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM document_revision_attachments", Int::class.java))
        val expectedHash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        assertEquals(expectedHash, jdbc.queryForObject("SELECT sha256 FROM document_files", String::class.java))
        revisionIds.forEach { revisionId ->
            assertEquals(key, jdbc.queryForObject("SELECT citation_key FROM document_revisions WHERE id = ?", String::class.java, revisionId))
            val historical = jdbc.queryForObject("SELECT file_bytes FROM document_revisions WHERE id = ?", ByteArray::class.java, revisionId)
            val manifest = jdbc.queryForObject(
                "SELECT f.file_bytes FROM document_files f JOIN document_revision_attachments a ON a.file_id = f.id WHERE a.revision_id = ? AND a.is_primary",
                ByteArray::class.java,
                revisionId,
            )
            assertArrayEquals(bytes, historical)
            assertArrayEquals(bytes, manifest)
        }
        assertEquals(2, jdbc.queryForObject("SELECT current_revision FROM documents WHERE id = ?", Int::class.java, documentId))
    }

    companion object {
        @Container @JvmStatic
        val postgres: PostgreSQLContainer = PostgreSQLContainer("postgres:16-alpine")
    }
}

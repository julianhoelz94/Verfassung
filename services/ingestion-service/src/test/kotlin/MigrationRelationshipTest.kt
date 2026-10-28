import com.constitutionatlas.ingestion.client.reconcileDocumentLink
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper

class MigrationRelationshipTest {
    private val mapper = JsonMapper()
    private val empty = mapper.readTree("[]")
    private val linked = mapper.readTree("""[{"documentId":"document","revisionId":"exact"}]""")

    @Test
    fun lostResponseReconcilesOnlyTheExactCommittedRevision() {
        var persisted = empty
        val result = reconcileDocumentLink("document", "exact", { persisted }) {
            persisted = linked
            throw IllegalStateException("Response lost after commit")
        }
        assertEquals(linked, result)
        assertEquals(linked, reconcileDocumentLink("document", "exact", { persisted }) { error("Duplicate write") })
        assertThrows(IllegalStateException::class.java) {
            reconcileDocumentLink("document", "other", { persisted }) { throw IllegalStateException("Conflicting pin") }
        }
    }
}

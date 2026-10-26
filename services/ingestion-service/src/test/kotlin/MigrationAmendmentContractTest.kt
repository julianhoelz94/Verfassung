import com.constitutionatlas.ingestion.service.validateMigrationAmendment
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MigrationAmendmentContractTest {
    private val mapper = ObjectMapper()

    @Test
    fun unsupportedFieldsAtEveryNestingLevelFailBeforeAnyNativeAmendmentWrite() {
        for ((body, path) in listOf(
            """{"constitutionId":"id","record":{"title":"Law"},"extra":true}""" to "amendment",
            """{"record":{"title":"Law","publishAttemptId":"caller-owned"}}""" to "amendment.record",
            """{"record":{"title":"Law","summary":"unstored"}}""" to "amendment.record",
            """{"record":{"changes":[{"changeType":"changed","extra":true}]}}""" to "changes[0]",
            """{"record":{"changes":[{"beforeRef":{"unknownTarget":"id"}}]}}""" to "beforeRef",
            """{"record":{"changes":[{"afterRef":{"logicalId":"unit","text":"unverified caller quotation"}}]}}""" to "afterRef",
            """{"record":{"documents":[{"url":"https://example.org","extra":true}]}}""" to "documents[0]",
        )) {
            val failure = assertThrows(IllegalArgumentException::class.java) { validateMigrationAmendment(mapper.readTree(body)) }
            assertTrue(failure.message!!.contains(path))
        }
        validateMigrationAmendment(mapper.readTree("""{"constitutionId":"id","record":{"title":"Law","comment":"Exact source evidence","changes":[{"changeType":"changed","beforeRef":{"versionId":"version","logicalId":"unit"}}],"documents":[{"url":"https://example.org/source","label":"Source"}]}}"""))
    }
}

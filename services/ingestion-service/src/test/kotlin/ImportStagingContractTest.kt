import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.ingestion.service.ImportService
import com.constitutionatlas.platform.OrderedContentValidationException
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNodeWrite
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.web.server.ResponseStatusException
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.security.MessageDigest
import java.util.UUID

class ImportStagingContractTest {
    private val mapper = jacksonObjectMapper()
    private val repository = Mockito.mock(ImportJobRepository::class.java)
    private val catalog = Mockito.mock(CatalogClient::class.java)
    private val content = Mockito.mock(ContentClient::class.java)
    private val service = ImportService(repository, catalog, content, mapper, "")
    private val owner = UUID.randomUUID()
    private val key = "stable-source-key"
    private val request = ImportRequest("DE", "Germany", "constitution", "Constitution", "Original", sourceUrl = "https://example.test/source")
    private val existing = ImportJobDto(UUID.randomUUID(), "completed", UUID.randomUUID(), emptyList())

    @Test
    fun invalidKeyAndExpectedChecksumFailBeforeAnyLookup() {
        assertEquals("Idempotency key must contain 8 to 128 characters", failure { service.importVersion(null, owner, request, idempotencyKey = "short", expectedChecksum = "wrong") }.reason)
        assertEquals("Payload checksum mismatch", failure { service.importVersion(null, owner, request, idempotencyKey = key, expectedChecksum = "wrong") }.reason)
        Mockito.verifyNoInteractions(repository, catalog, content)
    }

    @Test
    fun matchingHistoricalReceiptReturnsBeforeOutlineDiscoveryOrValidation() {
        val invalidMetadata = request.copy(isoCode = "invalid", constitutionId = UUID.randomUUID(), settingsRevisionId = UUID.randomUUID())
        Mockito.`when`(repository.findDirectItem(owner, key)).thenReturn(existing to checksum(invalidMetadata))

        assertEquals(existing, service.importVersion("Bearer editor", owner, invalidMetadata, idempotencyKey = key, expectedChecksum = checksum(invalidMetadata).uppercase()))

        Mockito.verify(repository).findDirectItem(owner, key)
        Mockito.verifyNoMoreInteractions(repository)
        Mockito.verifyNoInteractions(catalog, content)
    }

    @Test
    fun conflictingReceiptTakesPrecedenceOverCurrentRichRuleErrors() {
        val invalidRich = invalidRichRequest()
        Mockito.`when`(repository.findDirectItem(owner, key)).thenReturn(existing to "historical-other-checksum")

        assertEquals("Idempotency key was used for different content", failure { service.importVersion(null, owner, invalidRich, idempotencyKey = key) }.reason)
        Mockito.verifyNoInteractions(catalog, content)
    }

    @Test
    fun matchingReceiptStillEnforcesCurrentRichRulesWithoutWriting() {
        val invalidRich = invalidRichRequest()
        Mockito.`when`(repository.findDirectItem(owner, key)).thenReturn(existing to checksum(invalidRich))

        assertThrows(OrderedContentValidationException::class.java) { service.importVersion(null, owner, invalidRich, idempotencyKey = key) }

        Mockito.verify(repository).findDirectItem(owner, key)
        Mockito.verifyNoMoreInteractions(repository)
        Mockito.verifyNoInteractions(catalog, content)
    }

    @Test
    fun losingABatchInsertRaceReusesOnlyTheMatchingReceiptWithoutStaging() {
        val batch = UUID.randomUUID()
        val hash = checksum(request)
        Mockito.`when`(repository.findBatchItem(batch, key)).thenReturn(null, existing to hash)
        Mockito.`when`(repository.insertPending(request, owner, batch, key, hash)).thenReturn(null)

        assertEquals(existing, service.importVersion(null, owner, request, batch, key))

        val order = Mockito.inOrder(repository)
        order.verify(repository).findBatchItem(batch, key)
        order.verify(repository).insertPending(request, owner, batch, key, hash)
        order.verify(repository).findBatchItem(batch, key)
        Mockito.verifyNoMoreInteractions(repository)
    }

    @Test
    fun anonymousInsertConflictCannotReuseAnUnrelatedReceipt() {
        assertEquals("Idempotency key was used for different content", failure { service.importVersion(null, owner, request) }.reason)
        Mockito.verify(repository).insertPending(request, owner, null, null, checksum(request))
        Mockito.verifyNoMoreInteractions(repository)
    }

    private fun invalidRichRequest() = request.copy(roots = listOf(OrderedNodeWrite(kind = "article", content = listOf(OrderedEntryWrite("text", logicalId = UUID.randomUUID(), text = "Orphan note", format = "footnote")))))

    private fun checksum(payload: ImportRequest): String = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(payload)).joinToString("") { "%02x".format(it) }

    private fun failure(action: () -> Unit): ResponseStatusException = assertThrows(ResponseStatusException::class.java, action)
}

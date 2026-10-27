import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.MigrationItem
import com.constitutionatlas.ingestion.client.MigrationDomainClient
import com.constitutionatlas.ingestion.repo.MigrationRepository
import com.constitutionatlas.ingestion.service.ImportService
import com.constitutionatlas.ingestion.service.MigrationService
import com.constitutionatlas.platform.Actor
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import tools.jackson.databind.JsonNode
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.util.UUID

class MigrationPreparationTest {
    private val mapper = jacksonObjectMapper()
    private val repository = Mockito.mock(MigrationRepository::class.java)
    private val imports = Mockito.mock(ImportService::class.java)
    private val domains = Mockito.mock(MigrationDomainClient::class.java)
    private val service = MigrationService(repository, imports, domains, mapper)
    private val run = UUID.randomUUID()
    private val actor = Actor(UUID.randomUUID(), "editor@example.test", listOf("editor"))
    private val authorization = "Bearer editor"

    @Test
    fun comparisonResolvesExactDependencyPinsWithoutChangingTheStagedDefinition() {
        val constitution = UUID.randomUUID()
        val version = UUID.randomUUID()
        val document = UUID.randomUUID()
        val comparison = UUID.randomUUID()
        val payload = tree("""{"title":"Comparison","sourceDocumentKey":"source","columns":[{"versionKey":"snapshot","label":"Original"},{"versionId":"already-pinned","label":"Other"}]}""")
        val original = payload.deepCopy()
        val item = staged(
            "comparison",
            payload,
            listOf(
                prepared("source", """{"documentId":"$document","revision":7}"""),
                prepared("snapshot", """{"constitutionId":"$constitution","versionId":"$version"}"""),
            ),
        )
        val expected = tree("""{"title":"Comparison","attemptId":"${item.id}","sourceDocumentId":"$document","sourceDocumentRevision":7,"columns":[{"versionId":"$version","constitutionId":"$constitution","label":"Original"},{"versionId":"already-pinned","label":"Other"}]}""")
        Mockito.`when`(domains.comparison(expected, authorization)).thenReturn(tree("""{"id":"$comparison","state":"draft"}"""))

        service.prepare(run, item.id, actor, authorization)

        Mockito.verify(domains).comparison(expected, authorization)
        Mockito.verify(repository).finishAttempt(item.id, 1, "prepared", tree("""{"comparisonId":"$comparison","status":"draft"}"""))
        assertEquals(original, payload, "Resolving pins must not mutate the stored source definition")
    }

    @Test
    fun legacyMappingsResolveVersionAndCapturedRevisionWithoutChangingTheEvidence() {
        val version = UUID.randomUUID()
        val document = UUID.randomUUID()
        val payload = tree("""{"sourceUrl":"https://archive.example/original","targetKey":"snapshot","documentKey":"capture"}""")
        val original = payload.deepCopy()
        val item = staged(
            "legacy_mapping",
            payload,
            listOf(
                prepared("snapshot", """{"versionId":"$version"}"""),
                prepared("capture", """{"documentId":"$document","revision":4}"""),
            ),
        )
        val expected = tree("""{"sourceUrl":"https://archive.example/original","versionId":"$version","documentId":"$document","documentRevision":4}""")
        val receipt = tree("""{"id":"mapping","state":"draft"}""")
        Mockito.`when`(domains.legacyMapping(expected, authorization)).thenReturn(receipt)

        service.prepare(run, item.id, actor, authorization)

        Mockito.verify(domains).legacyMapping(expected, authorization)
        Mockito.verify(repository).finishAttempt(item.id, 1, "prepared", receipt)
        assertEquals(original, payload)
    }

    @Test
    fun amendmentDocumentLinksCarryBothExactRevisionPins() {
        val amendment = UUID.randomUUID()
        val scope = UUID.randomUUID()
        val document = UUID.randomUUID()
        val revision = UUID.randomUUID()
        val item = staged(
            "document_link",
            tree("""{"documentKey":"capture","targetKey":"law","targetType":"amendment"}"""),
            listOf(
                prepared("capture", """{"documentId":"$document","revisionId":"$revision"}"""),
                prepared("law", """{"amendmentId":"$amendment","scopeRevisionId":"$scope"}"""),
            ),
        )
        val expected = mapOf("documentId" to document.toString(), "revisionId" to revision.toString(), "scopeRevisionId" to scope.toString())
        Mockito.`when`(domains.documentLink("amendment", amendment, expected, authorization)).thenReturn(tree("[]"))

        service.prepare(run, item.id, actor, authorization)

        Mockito.verify(domains).documentLink("amendment", amendment, expected, authorization)
        Mockito.verify(repository).finishAttempt(item.id, 1, "prepared", tree("""{"targetType":"amendment","targetId":"$amendment","documentId":"$document","revisionId":"$revision"}"""))
    }

    @Test
    fun objectValuedRelationshipIdentityFailsValidationBeforeAnyLinkWrite() {
        val item = staged(
            "document_link",
            tree("""{"documentKey":"capture","targetKey":"law","targetType":"amendment"}"""),
            listOf(
                prepared("capture", """{"documentId":"${UUID.randomUUID()}","revisionId":"${UUID.randomUUID()}"}"""),
                prepared("law", """{"amendmentId":{},"scopeRevisionId":"${UUID.randomUUID()}"}"""),
            ),
        )

        service.prepare(run, item.id, actor, authorization)

        assertFailed(item, "Invalid UUID string")
        Mockito.verifyNoInteractions(domains)
    }

    @Test
    fun undeclaredDependenciesCannotBeResolvedIntoLegacyMappings() {
        val item = staged("legacy_mapping", tree("""{"targetKey":"not-declared"}"""))

        service.prepare(run, item.id, actor, authorization)

        assertFailed(item, "Relationship target must be an explicit dependency")
        Mockito.verifyNoInteractions(domains)
    }

    @Test
    fun amendmentPreparationPinsItsAttemptAndRejectsAnUnpinnedResponse() {
        val constitution = UUID.randomUUID()
        val payload = tree("""{"constitutionId":"$constitution","record":{"title":"Amending law"}}""")
        val original = payload.deepCopy()
        val item = staged("amendment", payload)
        val expected = tree("""{"title":"Amending law","publishAttemptId":"${item.id}"}""")
        Mockito.`when`(domains.amendment(constitution, expected, authorization)).thenReturn(tree("""{"id":"${UUID.randomUUID()}","status":"draft"}"""))

        service.prepare(run, item.id, actor, authorization)

        Mockito.verify(domains).amendment(constitution, expected, authorization)
        assertFailed(item, "Prepared amendment has no revision pin")
        assertEquals(original, payload)
    }

    @Test
    fun alreadyPreparedSnapshotReusesItsJobAndKeepsThePinnedConstitution() {
        val job = UUID.randomUUID()
        val version = UUID.randomUUID()
        val constitution = UUID.randomUUID()
        val payload = tree("""{"constitutionSlug":"constitution","constitutionTitle":"Constitution","versionLabel":"Original","constitutionId":"$constitution"}""")
        val item = staged("snapshot", payload, result = tree("""{"jobId":"$job"}"""))
        Mockito.`when`(imports.getJob(job)).thenReturn(ImportJobDto(job, "pending_review", version, emptyList()))

        service.prepare(run, item.id, actor, authorization)

        Mockito.verify(repository).finishAttempt(item.id, 1, "prepared", tree("""{"jobId":"$job","versionId":"$version","constitutionId":"$constitution","status":"pending_review"}"""))
        Mockito.verify(imports).getJob(job)
        Mockito.verifyNoMoreInteractions(imports)
    }

    private fun staged(kind: String, payload: JsonNode, dependencies: List<MigrationItem> = emptyList(), result: JsonNode = tree("{}")): MigrationItem {
        val item = MigrationItem(UUID.randomUUID(), "item", kind, "hash", dependencies.map { it.sourceKey }, "staged", result, 0, null)
        Mockito.`when`(repository.owner(run)).thenReturn(actor.id)
        Mockito.`when`(repository.items(run)).thenReturn(dependencies + item)
        Mockito.`when`(repository.claim(item.id, actor.id)).thenReturn(1)
        Mockito.`when`(repository.payload(item.id)).thenReturn(payload)
        return item
    }

    private fun prepared(key: String, result: String) = MigrationItem(UUID.randomUUID(), key, "dependency", "hash", emptyList(), "prepared", tree(result), 1, null)

    private fun assertFailed(item: MigrationItem, message: String) {
        val error = ArgumentCaptor.forClass(String::class.java)
        Mockito.verify(repository).finishAttempt(Mockito.eq(item.id) ?: item.id, Mockito.eq(1), Mockito.eq("failed") ?: "failed", Mockito.eq(item.result) ?: item.result, error.capture())
        assertTrue(error.value.contains(message), error.value)
    }

    private fun tree(json: String): JsonNode = mapper.readTree(json)
}

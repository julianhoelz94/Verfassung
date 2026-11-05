import com.constitutionatlas.amendment.CatalogUnavailableException
import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.CatalogVersionRef
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.repo.AmendmentRepository
import com.constitutionatlas.amendment.repo.ChangeRecordPublishAttemptRepository
import com.constitutionatlas.amendment.service.AmendmentDiffReviewService
import com.constitutionatlas.amendment.service.AmendmentService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.UUID

class AmendmentReaderLinksTest {
    @Test
    fun `catalog outage omits optional links while preserving saved amendment references`() {
        val repository = Mockito.mock(AmendmentRepository::class.java)
        val catalog = Mockito.mock(CatalogClient::class.java)
        val service = AmendmentService(repository, Mockito.mock(ContentClient::class.java), catalog, Mockito.mock(ChangeRecordPublishAttemptRepository::class.java), Mockito.mock(AmendmentDiffReviewService::class.java))
        val constitution = UUID.randomUUID()
        val version = UUID.randomUUID()
        val before = AmendmentUnitRefDto(versionId = version, logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), occurrenceId = UUID.randomUUID(), deepLink = "/obsolete-link")
        val change = AmendmentChangeDto(UUID.randomUUID(), articleId = null, articleNumber = "1", changeType = "removed", note = "Original note", nodeId = null, changedOn = null, effectiveOn = null, amendingLawCitationId = null, beforeRef = before)
        val record = AmendmentDto(UUID.randomUUID(), constitution, "published", title = "Amendment", comment = "Original comment", enactedOn = null, effectiveOn = null, sourceVersionId = version, targetVersionId = null, changes = listOf(change, change.copy(id = UUID.randomUUID())))
        Mockito.`when`(repository.listPublishedForConstitution(constitution)).thenReturn(listOf(record))
        Mockito.`when`(catalog.getVersion(version)).thenThrow(CatalogUnavailableException("Catalog temporarily unavailable"))

        val actual = service.listForConstitution(constitution).single()

        assertThat(actual).isEqualTo(record.copy(changes = record.changes.map { it.copy(beforeRef = before.copy(deepLink = null)) }))
        Mockito.verify(catalog, Mockito.times(1)).getVersion(version)
    }

    @Test
    fun `published change records expose direct snapshot links with bounded owner lookups`() {
        val repository = Mockito.mock(AmendmentRepository::class.java)
        val catalog = Mockito.mock(CatalogClient::class.java)
        val service = AmendmentService(repository, Mockito.mock(ContentClient::class.java), catalog, Mockito.mock(ChangeRecordPublishAttemptRepository::class.java), Mockito.mock(AmendmentDiffReviewService::class.java))
        val constitution = UUID.randomUUID()
        val source = UUID.randomUUID()
        val target = UUID.randomUUID()
        val jurisdiction = UUID.randomUUID()
        val before = AmendmentUnitRefDto(versionId = source, occurrenceId = UUID.randomUUID(), rootOccurrenceId = UUID.randomUUID(), deepLink = "/obsolete-link")
        val after = AmendmentUnitRefDto(versionId = target, occurrenceId = UUID.randomUUID(), rootOccurrenceId = UUID.randomUUID(), deepLink = "/obsolete-link")
        val change = AmendmentChangeDto(UUID.randomUUID(), articleId = null, articleNumber = "1", changeType = "changed", note = null, nodeId = null, changedOn = null, effectiveOn = null, amendingLawCitationId = null, beforeRef = before, afterRef = after)
        val record = AmendmentDto(UUID.randomUUID(), constitution, "published", title = "Amendment", comment = "Changed wording", enactedOn = null, effectiveOn = null, sourceVersionId = source, targetVersionId = target, changes = listOf(change, change.copy(id = UUID.randomUUID())))
        Mockito.`when`(repository.listPublishedForConstitution(constitution)).thenReturn(listOf(record, record.copy(id = UUID.randomUUID())))
        Mockito.`when`(catalog.getVersion(source)).thenReturn(CatalogVersionRef(source, countryCode = "DE"))
        Mockito.`when`(catalog.getVersion(target)).thenReturn(CatalogVersionRef(target, jurisdictionId = jurisdiction))

        val records = service.listForConstitution(constitution)

        assertThat(records.flatMap { it.changes }.map { it.beforeRef?.deepLink }).containsOnly("/countries/DE/versions/$source#${before.occurrenceId}")
        assertThat(records.flatMap { it.changes }.map { it.afterRef?.deepLink }).containsOnly("/jurisdictions/$jurisdiction/versions/$target#${after.occurrenceId}")
        assertThat(records.first().changes.first().beforeRef?.occurrenceId).isEqualTo(before.occurrenceId)
        Mockito.verify(catalog, Mockito.times(1)).getVersion(source)
        Mockito.verify(catalog, Mockito.times(1)).getVersion(target)
    }
}

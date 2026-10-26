import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportPublicationAdvice
import com.constitutionatlas.ingestion.api.ImportPublicationException
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.ingestion.service.ImportService
import com.constitutionatlas.platform.OrderedSnapshot
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.http.HttpStatus
import org.springframework.web.client.HttpClientErrorException
import java.util.UUID

class ImportPublicationTest {
    private val jobs = Mockito.mock(ImportJobRepository::class.java)
    private val catalog = Mockito.mock(CatalogClient::class.java)
    private val content = Mockito.mock(ContentClient::class.java)
    private val job = UUID.randomUUID()
    private val actor = UUID.randomUUID()
    private val version = UUID.randomUUID()
    private val settings = UUID.randomUUID()

    private fun service(token: String = "configured-token") = ImportService(jobs, catalog, content, jacksonObjectMapper(), token)

    private fun approved() {
        Mockito.`when`(jobs.claimPublication(job, actor)).thenReturn(true)
        Mockito.`when`(jobs.find(job)).thenReturn(ImportJobDto(job, "publishing", version, emptyList()))
        Mockito.`when`(jobs.approvedFingerprint(job)).thenReturn(1L to settings)
        Mockito.`when`(content.snapshot(version)).thenReturn(OrderedSnapshot(version, 1, settings, emptyList()))
        Mockito.`when`(catalog.version(version)).thenReturn(DownstreamVersion(version))
    }

    @Test
    fun absentProductionCredentialDoesNotClaimOrStrandTheApprovedJob() {
        val failure = assertThrows(ImportPublicationException::class.java) { service("").publish("Bearer admin", job, actor) }
        assertThat(failure.code).isEqualTo("publication_not_configured")
        assertThat(failure.status).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE)
        Mockito.verifyNoInteractions(jobs, catalog, content)
    }

    @Test
    fun internalAuthorizationFailureRetainsApprovalAndReturnsSafeConfigurationError() {
        approved()
        Mockito.doThrow(HttpClientErrorException.create(HttpStatus.FORBIDDEN, "Forbidden", null, "private downstream detail".toByteArray(), null))
            .`when`(content).sealImport(version, job, 1, settings)
        val failure = assertThrows(ImportPublicationException::class.java) { service().publish("Bearer admin", job, actor) }
        assertThat(failure.code).isEqualTo("publication_credentials_invalid")
        Mockito.verify(jobs).publishFailed(job)
        Mockito.verify(catalog, Mockito.never()).version(version)
        Mockito.verify(catalog, Mockito.never()).publishVersion(version, job)
        assertThat(ImportPublicationAdvice().publication(failure).body).isEqualTo(mapOf("code" to "publication_credentials_invalid"))
    }

    @Test
    fun changedApprovedContentCannotBeSealedOrPublished() {
        approved()
        Mockito.`when`(content.snapshot(version)).thenReturn(OrderedSnapshot(version, 2, settings, emptyList()))
        val failure = assertThrows(ImportPublicationException::class.java) { service().publish("Bearer admin", job, actor) }
        assertThat(failure.code).isEqualTo("approved_snapshot_changed")
        Mockito.verify(content, Mockito.never()).sealImport(version, job, 1, settings)
        Mockito.verify(jobs).publishFailed(job)
    }

    @Test
    fun configuredPublicationStillUsesTheApprovedSnapshotAndCompletes() {
        approved()
        service().publish("Bearer admin", job, actor)
        Mockito.verify(content).sealImport(version, job, 1, settings)
        Mockito.verify(catalog).publishVersion(version, job)
        Mockito.verify(jobs).complete(job, version, actor)
    }
}

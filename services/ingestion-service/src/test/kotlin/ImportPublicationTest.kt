import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportPublicationAdvice
import com.constitutionatlas.ingestion.api.ImportPublicationException
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamVersion
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.ingestion.service.ImportService
import com.constitutionatlas.platform.OrderedSnapshot
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.http.HttpStatus
import org.springframework.web.client.HttpClientErrorException
import tools.jackson.module.kotlin.jacksonObjectMapper
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
        Mockito.doThrow(HttpClientErrorException.create(HttpStatus.FORBIDDEN, "Forbidden", org.springframework.http.HttpHeaders.EMPTY, "private downstream detail".toByteArray(), null))
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
    fun orphanedPreparedContentCannotBeApprovedOrPublished() {
        val note = UUID.randomUUID()
        val root = com.constitutionatlas.platform.OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "article", null, null, listOf(com.constitutionatlas.platform.OrderedEntry("text", logicalId = note, text = "Unreferenced source note", format = "footnote")))
        val snapshot = OrderedSnapshot(version, 1, settings, listOf(root))
        Mockito.`when`(jobs.find(job)).thenReturn(ImportJobDto(job, "prepared", version, emptyList()))
        Mockito.`when`(content.snapshot(version)).thenReturn(snapshot)
        val approval = assertThrows(com.constitutionatlas.platform.OrderedContentValidationException::class.java) { service().approve("Bearer reviewer", job, actor, "Reviewed source and note references.") }
        assertThat(approval.errors.single().code).isEqualTo("FOOTNOTE_MARK_CARDINALITY")
        assertThat(ImportPublicationAdvice().content(approval).body).containsEntry("logicalId", note.toString())
        Mockito.verify(jobs, Mockito.never()).approve(job, actor, snapshot, "Reviewed source and note references.")

        approved()
        Mockito.`when`(content.snapshot(version)).thenReturn(snapshot)
        val publication = assertThrows(ImportPublicationException::class.java) { service().publish("Bearer publisher", job, actor) }
        assertThat(ImportPublicationAdvice().publication(publication).body).isEqualTo(mapOf("code" to "FOOTNOTE_MARK_CARDINALITY", "path" to "roots[0].content[0]", "logicalId" to note.toString()))
        Mockito.verify(jobs).publishFailed(job)
        Mockito.verify(content, Mockito.never()).sealImport(version, job, 1, settings)
        Mockito.verify(catalog, Mockito.never()).publishVersion(version, job)
    }

    @Test
    fun sharedNoteMarkersAcrossArticlesCanBeApprovedAndPublished() {
        val note = UUID.randomUUID()
        val roots = List(2) {
            com.constitutionatlas.platform.OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "article", null, null, listOf(com.constitutionatlas.platform.OrderedEntry("text", text = "Law", references = listOf(com.constitutionatlas.platform.OrderedInlineReference(UUID.randomUUID(), 3, 3, com.constitutionatlas.platform.OrderedReferenceTarget("footnote", footnoteId = note))))))
        } + com.constitutionatlas.platform.OrderedNode(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "article", null, null, listOf(com.constitutionatlas.platform.OrderedEntry("text", logicalId = note, text = "Shared source note", format = "footnote")))
        val snapshot = OrderedSnapshot(version, 1, settings, roots)
        Mockito.`when`(jobs.find(job)).thenReturn(ImportJobDto(job, "prepared", version, emptyList()))
        Mockito.`when`(content.snapshot(version)).thenReturn(snapshot)
        Mockito.`when`(jobs.approve(job, actor, snapshot, "Reviewed shared note references.")).thenReturn(true)
        service().approve("Bearer reviewer", job, actor, "Reviewed shared note references.")
        Mockito.verify(jobs).approve(job, actor, snapshot, "Reviewed shared note references.")
        approved()
        Mockito.`when`(content.snapshot(version)).thenReturn(snapshot)
        service().publish("Bearer publisher", job, actor)
        Mockito.verify(content).sealImport(version, job, 1, settings)
        Mockito.verify(catalog).publishVersion(version, job)
        Mockito.verify(jobs).complete(job, version, actor)
    }

    @Test
    fun configuredPublicationStillUsesTheApprovedSnapshotAndCompletes() {
        approved()
        service().publish("Bearer admin", job, actor)
        Mockito.verify(content).sealImport(version, job, 1, settings)
        Mockito.verify(catalog).publishVersion(version, job)
        Mockito.verify(jobs).complete(job, version, actor)
    }

    @Test
    fun deterministicContentValidationPreservesSafeCodeAndPathWithoutTransientRetryWording() {
        approved()
        val logical = UUID.randomUUID()
        val body = """{"code":"UNIT_REFERENCE_TARGET","path":"roots[1].content[0].references[2]","logicalId":"$logical","error":"private downstream detail","token":"must not leave the service"}"""
        Mockito.doThrow(HttpClientErrorException.create(HttpStatus.BAD_REQUEST, "Bad Request", org.springframework.http.HttpHeaders.EMPTY, body.toByteArray(), null))
            .`when`(content).sealImport(version, job, 1, settings)
        val failure = assertThrows(ImportPublicationException::class.java) { service().publish("Bearer admin", job, actor) }
        assertThat(failure.status).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(ImportPublicationAdvice().publication(failure).body).isEqualTo(mapOf("code" to "UNIT_REFERENCE_TARGET", "path" to "roots[1].content[0].references[2]", "logicalId" to logical.toString()))
        Mockito.verify(jobs).publishFailed(job)
        Mockito.verify(catalog, Mockito.never()).publishVersion(version, job)
    }

    @Test
    fun unrecognizedValidationDetailsAreNotForwardedToTheStaffResponse() {
        approved()
        val body = """{"code":"internal_private_failure","path":"/etc/private","error":"private downstream detail"}"""
        Mockito.doThrow(HttpClientErrorException.create(HttpStatus.BAD_REQUEST, "Bad Request", org.springframework.http.HttpHeaders.EMPTY, body.toByteArray(), null))
            .`when`(content).sealImport(version, job, 1, settings)
        val failure = assertThrows(ImportPublicationException::class.java) { service().publish("Bearer admin", job, actor) }
        assertThat(failure.status).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(ImportPublicationAdvice().publication(failure).body).isEqualTo(mapOf("code" to "publication_validation_failed"))
        Mockito.verify(jobs).publishFailed(job)
    }

    @Test
    fun unavailableContentServiceStillReturnsATransientAvailabilityFailure() {
        approved()
        Mockito.doThrow(org.springframework.web.client.HttpServerErrorException.create(HttpStatus.SERVICE_UNAVAILABLE, "Unavailable", org.springframework.http.HttpHeaders.EMPTY, "private downstream detail".toByteArray(), null))
            .`when`(content).sealImport(version, job, 1, settings)
        val failure = assertThrows(ImportPublicationException::class.java) { service().publish("Bearer admin", job, actor) }
        assertThat(failure.status).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE)
        assertThat(ImportPublicationAdvice().publication(failure).body).isEqualTo(mapOf("code" to "publication_unavailable"))
        Mockito.verify(jobs).publishFailed(job)
    }
}

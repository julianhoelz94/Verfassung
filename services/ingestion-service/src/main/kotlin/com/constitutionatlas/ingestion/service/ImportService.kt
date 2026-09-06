package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClientException
import java.util.UUID

@Service
class ImportService(
    private val importJobRepository: ImportJobRepository,
    private val catalogClient: CatalogClient,
    private val contentClient: ContentClient,
) {
    fun importVersion(request: ImportRequest): ImportJobDto {
        val jobId = importJobRepository.insertRunning(request)
        importJobRepository.stage(jobId, "request", request)

        val validation = ImportValidator.validate(request)
        if (validation.isNotEmpty()) {
            importJobRepository.fail(jobId, validation)
            return importJobRepository.find(jobId)!!
        }

        return try {
            persist(jobId, request)
        } catch (ex: RestClientException) {
            importJobRepository.fail(jobId, listOf("DOWNSTREAM" to (ex.message ?: "catalog or content call failed")))
            importJobRepository.find(jobId)!!
        } catch (ex: RuntimeException) {
            importJobRepository.fail(jobId, listOf("IMPORT_FAILED" to (ex.message ?: "import failed")))
            importJobRepository.find(jobId)!!
        }
    }

    fun getJob(jobId: UUID): ImportJobDto? = importJobRepository.find(jobId)

    private fun persist(jobId: UUID, request: ImportRequest): ImportJobDto {
        val iso = request.isoCode.trim().uppercase()
        if (catalogClient.getCountry(iso) == null) {
            catalogClient.createCountry(iso, request.countryName.trim())
        }
        val constitution = catalogClient.findConstitution(iso, request.constitutionSlug)
            ?: catalogClient.createConstitution(iso, request.constitutionSlug, request.constitutionTitle)
        request.outline?.takeIf { it.kinds.isNotEmpty() }?.let { outline ->
            catalogClient.replaceOutline(constitution.id, outline.kinds)
        }
        val version = catalogClient.createDraftVersion(
            constitution.id,
            request.versionLabel.trim(),
            request.effectiveDate,
            request.languageCode,
            request.sourceUrl,
            request.gazetteReference,
        )
        try {
            contentClient.replaceArticles(version.id, request.articles)
        } catch (ex: RuntimeException) {
            importJobRepository.fail(
                jobId,
                listOf("CONTENT_FAILED" to (ex.message ?: "content write failed; catalog version left unpublished")),
            )
            return importJobRepository.find(jobId)!!
        }
        catalogClient.publishVersion(version.id)
        importJobRepository.complete(jobId, version.id)
        return importJobRepository.find(jobId)!!
    }
}

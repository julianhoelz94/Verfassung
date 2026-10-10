package com.constitutionatlas.catalog.api

import com.constitutionatlas.catalog.client.WriteAccess
import com.constitutionatlas.catalog.service.CatalogQueryService
import com.constitutionatlas.catalog.service.CatalogWriteService
import com.constitutionatlas.catalog.service.ConstitutionMetadata
import com.constitutionatlas.catalog.service.ConstitutionMetadataService
import com.constitutionatlas.catalog.service.ConstitutionMetadataWrite
import com.constitutionatlas.catalog.service.LifecycleService
import com.constitutionatlas.catalog.service.ProvisionLifecycleService
import com.constitutionatlas.catalog.service.SettingsService
import com.constitutionatlas.catalog.service.WikiService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.util.UUID

@RestController
class CatalogController(
    private val catalogQueryService: CatalogQueryService,
    private val catalogWriteService: CatalogWriteService,
    private val writeAccess: WriteAccess,
    private val settingsService: SettingsService,
    private val metadataService: ConstitutionMetadataService,
    private val lifecycleService: LifecycleService,
    private val wikiService: WikiService,
    private val provisionLifecycleService: ProvisionLifecycleService,
) {
    @GetMapping("/countries")
    fun listCountries(): List<CountrySummary> = catalogQueryService.listCountries()

    @GetMapping("/countries/{isoCode}")
    fun getCountry(@PathVariable isoCode: String, @RequestHeader(value = "Authorization", required = false) authorization: String?): CountryDetail =
        catalogQueryService.getCountry(isoCode, writeAccess.mayViewPrivateCatalog(authorization))

    @GetMapping("/countries/{isoCode}/constitution-lifecycle")
    fun countryLifecycle(@PathVariable isoCode: String): List<LifecycleEvent> =
        lifecycleService.countryEvents(isoCode)

    @GetMapping("/constitutions/{constitutionId}/lifecycle-events")
    fun constitutionLifecycle(@PathVariable constitutionId: UUID): List<LifecycleEvent> =
        lifecycleService.events(constitutionId)

    @GetMapping("/constitutions/{constitutionId}/lifecycle-status")
    fun constitutionLifecycleStatus(
        @PathVariable constitutionId: UUID,
        @RequestParam(required = false) on: LocalDate?,
    ): Map<String, String> =
        mapOf("status" to lifecycleService.status(constitutionId, on ?: LocalDate.now()))

    @GetMapping("/countries/{isoCode}/provision-lifecycle")
    fun countryProvisionLifecycle(@PathVariable isoCode: String): List<ProvisionLifecycleEvent> =
        provisionLifecycleService.countryEvents(isoCode)

    @GetMapping("/constitutions/{constitutionId}/provision-events")
    fun constitutionProvisionLifecycle(@PathVariable constitutionId: UUID): List<ProvisionLifecycleEvent> =
        provisionLifecycleService.events(constitutionId)

    @PostMapping("/constitutions/{constitutionId}/provision-events")
    @ResponseStatus(HttpStatus.CREATED)
    fun appendProvisionLifecycle(
        @PathVariable constitutionId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: CreateProvisionLifecycleEvent,
    ): ProvisionLifecycleEvent =
        provisionLifecycleService.append(constitutionId, request, writeAccess.requireCatalogPublisher(authorization).id)

    @PostMapping("/constitutions/{constitutionId}/lifecycle-events")
    @ResponseStatus(HttpStatus.CREATED)
    fun appendConstitutionLifecycle(
        @PathVariable constitutionId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: CreateLifecycleEvent,
    ): LifecycleEvent =
        lifecycleService.append(constitutionId, request, writeAccess.requireCatalogPublisher(authorization).id)

    @GetMapping("/wiki/{targetType}/{targetId}")
    fun publicWiki(@PathVariable targetType: String, @PathVariable targetId: UUID): WikiPageRevision? =
        wikiService.published(targetType, targetId)

    @GetMapping("/wiki/{targetType}/{targetId}/revisions/{revisionId}")
    fun publicWikiRevision(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @PathVariable revisionId: UUID,
    ): WikiPageRevision? = wikiService.publishedRevision(targetType, targetId, revisionId)

    @GetMapping("/wiki/{targetType}/{targetId}/history")
    fun wikiHistory(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @RequestParam(defaultValue = "25") limit: Int,
        @RequestParam(defaultValue = "0") offset: Int,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<WikiPageRevision> {
        writeAccess.requireStaffCatalog(authorization)
        return wikiService.history(targetType, targetId, limit, offset)
    }

    @GetMapping("/wiki/{targetType}/{targetId}/draft")
    fun wikiDraft(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): WikiPageRevision? {
        writeAccess.requireStaffCatalog(authorization)
        return wikiService.draft(targetType, targetId)
    }

    @PutMapping("/wiki/{targetType}/{targetId}/draft")
    fun saveWiki(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: SaveWikiPage,
    ): WikiPageRevision =
        wikiService.save(targetType, targetId, request, writeAccess.requireCatalogWriter(authorization).id)

    @PostMapping("/wiki/{targetType}/{targetId}/publish")
    fun publishWiki(
        @PathVariable targetType: String,
        @PathVariable targetId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: PublishWikiPage,
    ): WikiPageRevision {
        writeAccess.requireCatalogPublisher(authorization)
        return wikiService.publish(targetType, targetId, request.revisionId, authorization)
    }

    @GetMapping("/constitutions/{constitutionId}/versions")
    fun listVersions(
        @PathVariable constitutionId: UUID,
        @RequestParam(required = false) listing: String?,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<VersionSummary> {
        val effectiveListing = listing ?: "public"
        return when (effectiveListing) {
            "public" -> catalogQueryService.listVersions(constitutionId)
            "all" -> {
                writeAccess.requireStaffCatalog(authorization)
                catalogQueryService.listAllPublishedVersions(constitutionId)
            }
            else -> throw IllegalArgumentException("listing must be public or all")
        }
    }

    @GetMapping("/versions/{versionId}")
    fun getVersion(@PathVariable versionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): VersionDetail =
        catalogQueryService.getVersion(versionId).also { version ->
            if (!writeAccess.mayViewPrivateCatalog(authorization) && (version.publicationStatus != "published" || version.listing != "public")) {
                throw com.constitutionatlas.platform.NotFoundException("Unknown version '$versionId'")
            }
        }

    @GetMapping("/constitutions/{constitutionId}/content-outline")
    fun getOutline(@PathVariable constitutionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): ContentOutlineDto =
        if (writeAccess.mayViewPrivateCatalog(authorization)) {
            catalogQueryService.getOutline(constitutionId)
        } else {
            settingsService.forVersion(publicVersionOrNotFound(constitutionId)).outline
        }

    @GetMapping("/constitutions/{constitutionId}/metadata")
    fun getMetadata(@PathVariable constitutionId: UUID): ConstitutionMetadata = metadataService.get(constitutionId)

    @PutMapping("/constitutions/{constitutionId}/metadata")
    fun saveMetadata(@PathVariable constitutionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: ConstitutionMetadataWrite): ConstitutionMetadata {
        writeAccess.requireCatalogWriter(authorization)
        return metadataService.save(constitutionId, request)
    }

    @GetMapping("/constitutions/{constitutionId}/settings")
    fun getSettings(@PathVariable constitutionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): SettingsRevision =
        if (writeAccess.mayViewPrivateCatalog(authorization)) {
            settingsService.current(constitutionId)
        } else {
            settingsService.forVersion(publicVersionOrNotFound(constitutionId))
        }

    @GetMapping("/constitutions/{constitutionId}/settings/{revisionId}")
    fun getSettingsRevision(@PathVariable constitutionId: UUID, @PathVariable revisionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): SettingsRevision {
        if (!writeAccess.mayViewPrivateCatalog(authorization) && settingsService.forVersion(publicVersionOrNotFound(constitutionId)).id != revisionId) {
            throw com.constitutionatlas.platform.NotFoundException("Unknown settings revision '$revisionId'")
        }
        return settingsService.revision(constitutionId, revisionId)
    }

    @PostMapping("/constitutions/{constitutionId}/settings/{revisionId}/restore")
    fun restoreSettings(@PathVariable constitutionId: UUID, @PathVariable revisionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: SettingsRestore): SettingsRevision {
        writeAccess.requireCatalogWriter(authorization)
        return settingsService.restore(constitutionId, revisionId, request.expectedRevisionId, authorization)
    }

    @GetMapping("/versions/{versionId}/reader-settings")
    fun getReaderSettings(@PathVariable versionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): ContentOutlineDto {
        getVersion(versionId, authorization)
        return settingsService.reader(versionId)
    }

    @GetMapping("/versions/{versionId}/settings")
    fun getVersionSettings(@PathVariable versionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): SettingsRevision {
        getVersion(versionId, authorization)
        return settingsService.forVersion(versionId)
    }

    private fun publicVersionOrNotFound(constitutionId: UUID): UUID =
        catalogQueryService.publicVersionId(constitutionId)
            ?: throw com.constitutionatlas.platform.NotFoundException("Unknown constitution '$constitutionId'")

    @PostMapping("/constitutions/{constitutionId}/settings/preflight")
    fun preflightSettings(
        @PathVariable constitutionId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: ContentOutlineWrite,
    ): SettingsImpact {
        writeAccess.requireCatalogWriter(authorization)
        return settingsService.impact(constitutionId, request.kinds, authorization)
    }

    @PutMapping("/constitutions/{constitutionId}/settings")
    fun saveSettings(
        @PathVariable constitutionId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: SettingsWrite,
    ): SettingsRevision {
        writeAccess.requireCatalogWriter(authorization)
        return settingsService.save(constitutionId, request, authorization)
    }

    @PutMapping("/constitutions/{constitutionId}/content-outline")
    fun putOutline(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable constitutionId: UUID,
        @RequestBody request: ContentOutlineWrite,
    ): OutlineUpdateResult {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.replaceOutline(constitutionId, request.kinds, authorization)
    }

    @PostMapping("/countries")
    @ResponseStatus(HttpStatus.CREATED)
    fun createCountry(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: CreateCountryRequest,
    ): CountrySummary {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.createCountry(request)
    }

    @PostMapping("/countries/{isoCode}/constitutions")
    @ResponseStatus(HttpStatus.CREATED)
    fun createConstitution(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable isoCode: String,
        @RequestBody request: CreateConstitutionRequest,
    ): ConstitutionSummary {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.createConstitution(isoCode, request)
    }

    @PostMapping("/constitutions/{constitutionId}/versions")
    @ResponseStatus(HttpStatus.CREATED)
    fun createVersion(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable constitutionId: UUID,
        @RequestBody request: CreateVersionRequest,
    ): VersionCreated {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.createDraftVersion(constitutionId, request)
    }

    @GetMapping("/publish-attempts/{attemptId}")
    fun publishAttempt(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable attemptId: UUID): VersionCreated {
        writeAccess.requireCatalogWriter(authorization)
        return catalogWriteService.publishAttempt(attemptId)
    }

    @PostMapping("/versions/{versionId}/publish")
    fun publishVersion(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable versionId: UUID,
        @RequestParam(required = false) importJobId: UUID?,
    ): VersionCreated {
        val actor = writeAccess.requireVersionPublisher(authorization)
        return catalogWriteService.publishVersion(versionId, actor, importJobId)
    }
}

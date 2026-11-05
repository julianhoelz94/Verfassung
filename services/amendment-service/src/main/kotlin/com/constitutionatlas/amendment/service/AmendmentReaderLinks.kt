package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.CatalogUnavailableException
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.CatalogVersionRef
import com.constitutionatlas.platform.readerPassageHref
import java.util.UUID

/** Request-local reader locations; repeated pins share lookups, including unavailable owners. */
internal class AmendmentReaderLinks(private val catalog: CatalogClient) {
    private val owners = mutableMapOf<UUID, CatalogVersionRef?>()

    /** Optional enrichment never makes saved amendment content depend on Catalog availability. */
    fun link(ref: AmendmentUnitRefDto): String? {
        val versionId = ref.versionId ?: return null
        val occurrence = ref.occurrenceId ?: ref.rootOccurrenceId ?: return null
        if (!owners.containsKey(versionId)) {
            owners[versionId] = try {
                catalog.getVersion(versionId)
            } catch (_: CatalogUnavailableException) {
                null
            }
        }
        val owner = owners[versionId]
        return readerPassageHref(owner?.countryCode, owner?.jurisdictionId, versionId, occurrence)
    }
}

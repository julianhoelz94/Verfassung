package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.SetupProposalDto
import com.constitutionatlas.ingestion.api.SetupProposalRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.DownstreamSetupConstitution
import com.constitutionatlas.ingestion.repo.SetupConfirmationClaim
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

/** Performs Catalog writes for one frozen setup claim; the service owns authorization and recovery. */
internal class SetupConstitutionCreation(private val catalog: CatalogClient) {
    /** Ensure country existence, then replay the atomic operation or reconcile only its recorded identity. */
    fun create(claim: SetupConfirmationClaim): DownstreamSetupConstitution {
        val proposal = claim.proposal
        val request = proposal.payload
        val iso = request.isoCode.trim().uppercase()
        if (request.jurisdictionId == null && catalog.getCountry(iso) == null) catalog.createCountry(iso, request.countryName.trim())
        return if (proposal.constitutionId == null) {
            // Catalog commits constitution, reviewed outline and the creation receipt together.
            // A lost response can replay only this operation and cannot adopt an unrelated slug.
            catalog.createSetupConstitution(claim.operationId, request)
        } else {
            restoreLegacy(proposal)
        }
    }

    /** Resolve the selected jurisdiction before its slug; country selection remains the legacy fallback. */
    fun findSelected(request: SetupProposalRequest) = request.jurisdictionId?.let {
        catalog.getJurisdiction(it)
        catalog.findJurisdictionConstitution(it, request.constitutionSlug.trim())
    } ?: if (request.jurisdictionId == null) catalog.findConstitution(request.isoCode.trim().uppercase(), request.constitutionSlug.trim()) else null

    /** Only a previously persisted identity permits recovery of setup predating atomic Catalog receipts. */
    private fun restoreLegacy(proposal: SetupProposalDto): DownstreamSetupConstitution {
        val request = proposal.payload
        val existing = findSelected(request) ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Recorded setup constitution is missing")
        if (existing.id != proposal.constitutionId || existing.title != request.constitutionTitle.trim()) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Recorded setup constitution no longer matches the reviewed resource")
        }
        catalog.replaceOutline(existing.id, request.outline.kinds)
        return DownstreamSetupConstitution(existing.id, catalog.currentSettingsRevisionId(existing.id))
    }
}

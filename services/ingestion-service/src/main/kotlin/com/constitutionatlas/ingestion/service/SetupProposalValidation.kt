package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.ingestion.api.SetupProposalRequest
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.ObjectMapper

/** Checks reviewed setup payloads in the historical metadata, outline, size and sample-tree order. */
internal class SetupProposalValidation(private val mapper: ObjectMapper) {
    /** Reject the first invalid field before setup discovery or persistence can observe the proposal. */
    fun validate(request: SetupProposalRequest) {
        validateMetadata(request)
        validateKinds(request.outline.kinds)
        if (request.sampleRoots.size !in 1..20) invalidSetupProposal("sampleRoots", "provide 1 to 20 representative roots")
        if (mapper.writeValueAsBytes(request).size > 64 * 1024) invalidSetupProposal("sampleRoots", "proposal exceeds 64 KiB")
        SetupSampleValidation(request.outline.kinds).validate(request.sampleRoots)
    }

    /** Preserve country-versus-jurisdiction, language and source diagnostic precedence without normalization. */
    private fun validateMetadata(request: SetupProposalRequest) {
        if (request.jurisdictionId == null && !request.isoCode.matches(Regex("[A-Za-z]{2}"))) invalidSetupProposal("isoCode", "use a two-letter country code")
        if (request.jurisdictionId == null && request.countryName.isBlank()) invalidSetupProposal("countryName", "required")
        if (!request.constitutionSlug.matches(Regex("[a-z0-9][a-z0-9-]{0,119}"))) invalidSetupProposal("constitutionSlug", "use lowercase letters, digits and hyphens")
        if (request.constitutionTitle.isBlank()) invalidSetupProposal("constitutionTitle", "required")
        if (!request.languageCode.matches(Regex("[a-z]{2,3}(-[A-Za-z0-9]{2,8})*"))) invalidSetupProposal("languageCode", "invalid language tag")
        if (request.sourceUrl.isNullOrBlank() && request.gazetteReference.isNullOrBlank()) invalidSetupProposal("source", "sourceUrl or gazetteReference is required")
        if (request.sourceUrl != null && !request.sourceUrl.startsWith("https://")) invalidSetupProposal("sourceUrl", "use an HTTPS source")
        if (request.jurisdictionId != null && request.isoCode.isNotBlank()) invalidSetupProposal("jurisdictionId", "use jurisdictionId or isoCode, not both")
    }

    /** Check level bounds and display syntax before sentence settings and duplicate kind identities. */
    private fun validateKinds(kinds: List<ImportOutlineKind>) {
        if (kinds.size !in 1..32) invalidSetupProposal("outline.kinds", "provide 1 to 32 kinds")
        if (kinds.any { !it.kindCode.matches(Regex("[a-z][a-z0-9_-]{0,31}")) || it.displayLabel.isBlank() }) invalidSetupProposal("outline.kinds", "each level needs a valid code and label")
        if (kinds.any { it.presentation !in setOf("section", "concatenated") || it.labelPlacement !in setOf("before_title", "after_title", "inline", "superscript") }) invalidSetupProposal("outline.kinds", "invalid display setting")
        ImportValidator.outlineSentenceErrors(kinds).firstOrNull()?.let { invalidSetupProposal("outline.kinds", it.second) }
        if (kinds.map { it.kindCode }.toSet().size != kinds.size) invalidSetupProposal("outline.kinds", "kind codes must be unique")
    }
}

/** Retain the public field prefix and BAD_REQUEST status used by every setup validation phase. */
internal fun invalidSetupProposal(field: String, message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$field: $message")

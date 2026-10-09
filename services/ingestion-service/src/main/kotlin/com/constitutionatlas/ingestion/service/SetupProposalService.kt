package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.SetupProposalDto
import com.constitutionatlas.ingestion.api.SetupProposalRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.repo.SetupProposalRepository
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
class SetupProposalService(
    private val proposals: SetupProposalRepository,
    private val catalog: CatalogClient,
    private val mapper: ObjectMapper,
) {
    fun create(authorization: String?, ownerId: UUID, request: SetupProposalRequest): SetupProposalDto {
        validate(request)
        DownstreamAuth.withAuthorization(authorization) { requireMissing(request) }
        return proposals.insert(ownerId, request)
    }

    fun get(id: UUID, actorId: UUID, admin: Boolean): SetupProposalDto {
        val proposal = proposals.find(id) ?: throw NotFoundException("Unknown or expired setup proposal")
        if (proposal.ownerId != actorId && !admin) throw ForbiddenException("Setup proposal belongs to another editor")
        return proposal
    }

    fun revise(authorization: String?, id: UUID, actorId: UUID, admin: Boolean, request: SetupProposalRequest): SetupProposalDto {
        get(id, actorId, admin)
        validate(request)
        DownstreamAuth.withAuthorization(authorization) { requireMissing(request) }
        if (!proposals.replace(id, request)) throw ResponseStatusException(HttpStatus.CONFLICT, "Setup proposal is no longer editable")
        return get(id, actorId, admin)
    }

    fun confirm(authorization: String?, id: UUID, actorId: UUID, admin: Boolean): SetupProposalDto {
        val proposal = get(id, actorId, admin)
        if (proposal.status == "confirmed") return proposal
        if (!proposals.claim(id)) throw ResponseStatusException(HttpStatus.CONFLICT, "Setup proposal is not ready to confirm")
        try {
            DownstreamAuth.withAuthorization(authorization) {
                val request = proposal.payload
                val iso = request.isoCode.trim().uppercase()
                val existing = catalog.findConstitution(iso, request.constitutionSlug)
                if (existing != null && existing.id != proposal.constitutionId) {
                    throw ResponseStatusException(HttpStatus.CONFLICT, "Constitution slug is already in use")
                }
                if (catalog.getCountry(iso) == null) catalog.createCountry(iso, request.countryName.trim())
                val constitution = existing ?: catalog.createConstitution(iso, request.constitutionSlug.trim(), request.constitutionTitle.trim())
                proposals.setConstitution(id, constitution.id)
                catalog.replaceOutline(constitution.id, request.outline.kinds)
                proposals.confirm(id, catalog.currentSettingsRevisionId(constitution.id), actorId)
            }
        } catch (ex: RuntimeException) {
            proposals.retry(id)
            throw ex
        }
        return get(id, actorId, admin)
    }

    fun withdraw(id: UUID, actorId: UUID, admin: Boolean): SetupProposalDto {
        get(id, actorId, admin)
        if (!proposals.withdraw(id)) throw ResponseStatusException(HttpStatus.CONFLICT, "Confirmed proposal cannot be withdrawn")
        return get(id, actorId, admin)
    }

    private fun requireMissing(request: SetupProposalRequest) {
        if (catalog.findConstitution(request.isoCode.trim().uppercase(), request.constitutionSlug.trim()) != null) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Constitution already exists; use its settings revision")
        }
    }

    private fun validate(request: SetupProposalRequest) {
        fun invalid(field: String, message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$field: $message")
        if (!request.isoCode.matches(Regex("[A-Za-z]{2}"))) invalid("isoCode", "use a two-letter country code")
        if (request.countryName.isBlank()) invalid("countryName", "required")
        if (!request.constitutionSlug.matches(Regex("[a-z0-9][a-z0-9-]{0,119}"))) invalid("constitutionSlug", "use lowercase letters, digits and hyphens")
        if (request.constitutionTitle.isBlank()) invalid("constitutionTitle", "required")
        if (!request.languageCode.matches(Regex("[a-z]{2,3}(-[A-Za-z0-9]{2,8})*"))) invalid("languageCode", "invalid language tag")
        if (request.sourceUrl.isNullOrBlank() && request.gazetteReference.isNullOrBlank()) invalid("source", "sourceUrl or gazetteReference is required")
        if (request.sourceUrl != null && !request.sourceUrl.startsWith("https://")) invalid("sourceUrl", "use an HTTPS source")
        val kinds = request.outline.kinds
        if (kinds.size !in 1..8) invalid("outline.kinds", "provide 1 to 8 levels")
        if (kinds.any { !it.kindCode.matches(Regex("[a-z][a-z0-9_-]{0,31}")) || it.displayLabel.isBlank() }) invalid("outline.kinds", "each level needs a valid code and label")
        if (kinds.map { it.kindCode }.toSet().size != kinds.size) invalid("outline.kinds", "kind codes must be unique")
        if (request.sampleRoots.size !in 1..5) invalid("sampleRoots", "provide 1 to 5 representative roots")
        if (mapper.writeValueAsBytes(request).size > 64 * 1024) invalid("sampleRoots", "proposal exceeds 64 KiB")
        fun visit(node: com.constitutionatlas.platform.OrderedNodeWrite, depth: Int, path: String) {
            if (depth >= kinds.size || node.kind != kinds[depth].kindCode) invalid(path, "expected kind ${kinds.getOrNull(depth)?.kindCode ?: "none"}")
            if (node.content.orEmpty().any { it.type == "text" } && depth < kinds.lastIndex && !kinds[depth].allowTextAlongsideChildren) {
                invalid(path, "text alongside child units is not allowed at this level")
            }
            node.content.orEmpty().forEachIndexed { index, entry -> entry.node?.let { visit(it, depth + 1, "$path.content[$index].node") } }
        }
        request.sampleRoots.forEachIndexed { index, root -> visit(root, 0, "sampleRoots[$index]") }
    }
}

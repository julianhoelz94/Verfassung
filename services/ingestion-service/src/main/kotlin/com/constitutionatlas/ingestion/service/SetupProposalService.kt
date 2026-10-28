package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.SetupDisplayRequest
import com.constitutionatlas.ingestion.api.SetupProposalDto
import com.constitutionatlas.ingestion.api.SetupProposalRequest
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.DownstreamAuth
import com.constitutionatlas.ingestion.repo.SetupProposalRepository
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.scalarText
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.ObjectNode
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

    fun revise(authorization: String?, id: UUID, actorId: UUID, admin: Boolean, request: SetupProposalRequest, revision: Long): SetupProposalDto {
        requireRevision(get(id, actorId, admin), revision)
        val configured = applyDisplay(request, proposals.displayOverrides(id))
        validate(configured)
        DownstreamAuth.withAuthorization(authorization) { requireMissing(configured) }
        return proposals.replace(id, configured, revision) ?: stale()
    }

    fun display(id: UUID, actorId: UUID, admin: Boolean, request: SetupDisplayRequest, revision: Long): SetupProposalDto {
        val current = get(id, actorId, admin)
        requireRevision(current, revision)
        if (request.kinds.map { it.kindCode }.toSet() != current.payload.outline.kinds.map { it.kindCode }.toSet() || request.kinds.size != current.payload.outline.kinds.size) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Display settings must retain the submitted hierarchy")
        }
        val overrides = (proposals.displayOverrides(id) as ObjectNode).deepCopy()
        request.kinds.forEach { kind ->
            val fields = mapper.valueToTree<ObjectNode>(kind)
            fields.remove("kindCode")
            overrides.set(kind.kindCode, fields)
        }
        val configured = applyDisplay(current.payload, overrides)
        validate(configured)
        return proposals.display(id, revision, configured, overrides) ?: stale()
    }

    fun requestChanges(id: UUID, actorId: UUID, admin: Boolean, message: String, revision: Long): SetupProposalDto {
        requireRevision(get(id, actorId, admin), revision)
        val trimmed = message.trim()
        if (trimmed.length !in 10..4000) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Requested changes require 10 to 4000 characters")
        return proposals.feedback(id, revision, trimmed) ?: stale()
    }

    fun confirm(authorization: String?, id: UUID, actorId: UUID, admin: Boolean, revision: Long): SetupProposalDto {
        val current = get(id, actorId, admin)
        requireRevision(current, revision)
        if (current.status == "confirmed") return current
        val claim = proposals.claim(id, revision) ?: run {
            val latest = get(id, actorId, admin)
            requireRevision(latest, revision)
            if (latest.status == "confirmed") return latest
            if (latest.status == "confirming") throw com.constitutionatlas.ingestion.api.ImportPublicationException(HttpStatus.CONFLICT, "setup_confirmation_running")
            throw ResponseStatusException(HttpStatus.CONFLICT, "Setup proposal is not ready to confirm")
        }
        val proposal = claim.proposal
        try {
            DownstreamAuth.withAuthorization(authorization) {
                val request = proposal.payload
                val iso = request.isoCode.trim().uppercase()
                if (request.jurisdictionId == null && catalog.getCountry(iso) == null) catalog.createCountry(iso, request.countryName.trim())
                val result = if (proposal.constitutionId == null) {
                    // Catalog commits constitution, reviewed outline and the creation receipt together.
                    // A lost response can replay only this operation and cannot adopt an unrelated slug.
                    catalog.createSetupConstitution(claim.operationId, request)
                } else {
                    // Before recoverable setup, a successful remote create was recorded separately.
                    // Only that persisted identity permits reconciliation of an older partial setup.
                    val existing = findSelected(request) ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Recorded setup constitution is missing")
                    if (existing.id != proposal.constitutionId || existing.title != request.constitutionTitle.trim()) {
                        throw ResponseStatusException(HttpStatus.CONFLICT, "Recorded setup constitution no longer matches the reviewed resource")
                    }
                    catalog.replaceOutline(existing.id, request.outline.kinds)
                    com.constitutionatlas.ingestion.client.DownstreamSetupConstitution(existing.id, catalog.currentSettingsRevisionId(existing.id))
                }
                if (!proposals.confirm(id, claim.attempt, result.id, result.settingsRevisionId, actorId)) stale()
            }
        } catch (ex: com.constitutionatlas.ingestion.client.SetupCreationRejectedException) {
            if (proposals.rejectWithoutWrites(id, claim.attempt)) {
                throw com.constitutionatlas.ingestion.api.ImportPublicationException(HttpStatus.CONFLICT, "setup_creation_rejected")
            }
            proposals.retry(id, claim.attempt)
            throw com.constitutionatlas.ingestion.api.ImportPublicationException(HttpStatus.CONFLICT, "setup_recovery_conflict")
        } catch (ex: RuntimeException) {
            proposals.retry(id, claim.attempt)
            throw ex
        }
        return get(id, actorId, admin)
    }

    fun withdraw(id: UUID, actorId: UUID, admin: Boolean, revision: Long): SetupProposalDto {
        requireRevision(get(id, actorId, admin), revision)
        if (!proposals.withdraw(id, revision)) stale()
        return get(id, actorId, admin)
    }

    private fun requireRevision(proposal: SetupProposalDto, revision: Long) {
        if (proposal.revision != revision) stale()
    }

    private fun stale(): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, "Proposal changed; reload and review the latest revision")

    private fun applyDisplay(request: SetupProposalRequest, overrides: tools.jackson.databind.JsonNode): SetupProposalRequest {
        val payload = mapper.valueToTree<ObjectNode>(request)
        payload.path("outline").path("kinds").forEach { kind ->
            overrides.path(kind.path("kindCode").scalarText()).properties().forEach { (name, value) -> (kind as ObjectNode).set(name, value) }
        }
        return mapper.treeToValue(payload, SetupProposalRequest::class.java)
    }

    private fun requireMissing(request: SetupProposalRequest) {
        if (findSelected(request) != null) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "Constitution already exists; use its settings revision")
        }
    }

    private fun findSelected(request: SetupProposalRequest) = request.jurisdictionId?.let {
        catalog.getJurisdiction(it)
        catalog.findJurisdictionConstitution(it, request.constitutionSlug.trim())
    } ?: if (request.jurisdictionId == null) catalog.findConstitution(request.isoCode.trim().uppercase(), request.constitutionSlug.trim()) else null

    private fun validate(request: SetupProposalRequest) {
        fun invalid(field: String, message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, "$field: $message")
        if (request.jurisdictionId == null && !request.isoCode.matches(Regex("[A-Za-z]{2}"))) invalid("isoCode", "use a two-letter country code")
        if (request.jurisdictionId == null && request.countryName.isBlank()) invalid("countryName", "required")
        if (!request.constitutionSlug.matches(Regex("[a-z0-9][a-z0-9-]{0,119}"))) invalid("constitutionSlug", "use lowercase letters, digits and hyphens")
        if (request.constitutionTitle.isBlank()) invalid("constitutionTitle", "required")
        if (!request.languageCode.matches(Regex("[a-z]{2,3}(-[A-Za-z0-9]{2,8})*"))) invalid("languageCode", "invalid language tag")
        if (request.sourceUrl.isNullOrBlank() && request.gazetteReference.isNullOrBlank()) invalid("source", "sourceUrl or gazetteReference is required")
        if (request.sourceUrl != null && !request.sourceUrl.startsWith("https://")) invalid("sourceUrl", "use an HTTPS source")
        if (request.jurisdictionId != null && request.isoCode.isNotBlank()) invalid("jurisdictionId", "use jurisdictionId or isoCode, not both")
        val kinds = request.outline.kinds
        if (kinds.size !in 1..32) invalid("outline.kinds", "provide 1 to 32 kinds")
        if (kinds.any { !it.kindCode.matches(Regex("[a-z][a-z0-9_-]{0,31}")) || it.displayLabel.isBlank() }) invalid("outline.kinds", "each level needs a valid code and label")
        if (kinds.any { it.presentation !in setOf("section", "concatenated") || it.labelPlacement !in setOf("before_title", "after_title", "inline", "superscript") }) invalid("outline.kinds", "invalid display setting")
        ImportValidator.outlineSentenceErrors(kinds).firstOrNull()?.let { invalid("outline.kinds", it.second) }
        if (kinds.map { it.kindCode }.toSet().size != kinds.size) invalid("outline.kinds", "kind codes must be unique")
        if (request.sampleRoots.size !in 1..20) invalid("sampleRoots", "provide 1 to 20 representative roots")
        if (mapper.writeValueAsBytes(request).size > 64 * 1024) invalid("sampleRoots", "proposal exceeds 64 KiB")
        val byCode = kinds.associateBy { it.kindCode }
        val roots = kinds.filter { it.root == true }.map { it.kindCode }.toSet().ifEmpty { setOfNotNull(kinds.firstOrNull()?.kindCode) }
        fun children(code: String): List<String> = byCode[code]?.let { level ->
            level.allowedChildKinds ?: kinds.getOrNull(kinds.indexOf(level) + 1)?.let { listOf(it.kindCode) }.orEmpty()
        }.orEmpty()
        kinds.forEach { kind ->
            if (kind.showTitle && kind.titlePolicy == "none") invalid("outline.kinds", "title display requires title permission")
            if (kind.showLabel && kind.labelPolicy == "none") invalid("outline.kinds", "label display requires label permission")
            if (kind.labelPlacement == "superscript" && children(kind.kindCode).isNotEmpty()) invalid("outline.kinds", "superscript labels require a leaf kind")
        }
        fun visit(node: com.constitutionatlas.platform.OrderedNodeWrite, parent: String?, path: String) {
            val kind = node.kind.orEmpty()
            if (kind !in byCode) invalid(path, "unknown kind '$kind'")
            if (parent == null && kind !in roots) invalid(path, "kind '$kind' is not an allowed root")
            if (parent != null && kind !in children(parent)) invalid(path, "kind '$kind' is not allowed under '$parent'")
            if (node.content.orEmpty().any { it.type == "text" } && children(kind).isNotEmpty() && byCode[kind]?.allowTextAlongsideChildren != true) {
                invalid(path, "text alongside child units is not allowed in '$kind'")
            }
            node.content.orEmpty().forEachIndexed { index, entry -> entry.node?.let { visit(it, kind, "$path.content[$index].node") } }
        }
        request.sampleRoots.forEachIndexed { index, root -> visit(root, null, "sampleRoots[$index]") }
    }
}

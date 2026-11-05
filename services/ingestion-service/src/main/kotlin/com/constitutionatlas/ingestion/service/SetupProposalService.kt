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
        try {
            DownstreamAuth.withAuthorization(authorization) {
                val result = SetupConstitutionCreation(catalog).create(claim)
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

    /** Keep discovery identical for proposed and previously recorded setup resources. */
    private fun findSelected(request: SetupProposalRequest) = SetupConstitutionCreation(catalog).findSelected(request)

    /** Apply ordered validation before any proposal persistence or Catalog discovery. */
    private fun validate(request: SetupProposalRequest) = SetupProposalValidation(mapper).validate(request)
}

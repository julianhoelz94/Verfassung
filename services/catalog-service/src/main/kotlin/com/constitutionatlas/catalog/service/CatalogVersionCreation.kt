package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.CreateVersionRequest
import com.constitutionatlas.catalog.api.VersionCreated
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.catalog.repo.PublishAttemptRepository
import com.constitutionatlas.catalog.repo.SettingsRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.dao.DataIntegrityViolationException
import java.security.MessageDigest
import java.util.UUID

/** Resolved legal/editorial chain links for a single newly generated version identity. */
internal data class CatalogVersionChain(val hopKind: String, val listing: String, val legalVersionId: UUID, val legalPredecessorId: UUID?, val editorialPredecessorId: UUID?)

/** Plain synchronous phases stay inside CatalogWriteService.createDraftVersion's existing transaction. */
internal class CatalogVersionCreation(private val catalog: CatalogRepository, private val settings: SettingsRepository, private val attempts: PublishAttemptRepository) {
    /** Reservation replay precedes label/chain validation; all pins and the receipt follow successful insertion. */
    fun create(constitutionId: UUID, request: CreateVersionRequest): VersionCreated {
        if (!catalog.constitutionExists(constitutionId)) throw NotFoundException("Unknown constitution '$constitutionId'")
        attempts.lock(constitutionId)
        val requestHash = digest(request.toString())
        reserved(constitutionId, request, requestHash)?.let { return it }
        val label = request.versionLabel.trim()
        if (catalog.versionLabelExists(constitutionId, label)) throw ConflictException("Version '$label' already exists")
        val id = UUID.randomUUID()
        val chain = chain(constitutionId, id, request)
        insert(id, constitutionId, label, request, chain)
        pin(id, constitutionId, request, requestHash)
        return catalog.findVersionCreated(id) ?: VersionCreated(id, constitutionId, label, "draft", request.predecessorVersionId, chain.hopKind, chain.listing, chain.legalVersionId)
    }

    /** Current and both historical hashes are checked lazily in their original short-circuit order. */
    private fun reserved(constitutionId: UUID, request: CreateVersionRequest, hash: String): VersionCreated? {
        request.publishAttemptId?.let { attempt ->
            attempts.find(attempt)?.let { reservation ->
                if (reservation.constitutionId != constitutionId || (reservation.requestHash != hash && reservation.requestHash != legacySourceRequestHash(request) && reservation.requestHash != inheritedSourceRequestHash(request))) {
                    throw ConflictException("Publish attempt payload changed", "publish_attempt_mismatch")
                }
                return catalog.findVersionCreated(reservation.versionId) ?: throw NotFoundException("Reserved version missing")
            }
        }
        return null
    }

    /** An initial version ignores hopKind; a successor canonicalizes it before reading its predecessor. */
    private fun chain(constitutionId: UUID, id: UUID, request: CreateVersionRequest): CatalogVersionChain {
        val predecessorId = request.predecessorVersionId
        if (predecessorId == null) {
            if (catalog.listAllVersionIds(constitutionId).isNotEmpty()) throw ConflictException("predecessorVersionId is required to append to an existing chain", "not_legal_tip")
            return CatalogVersionChain("initial", "public", id, null, null)
        }
        val hop = CatalogWriteService.canonicalizeHopKind(request.hopKind)
        val predecessor = catalog.findVersion(predecessorId)
        if (predecessor == null || predecessor.constitutionId != constitutionId) throw ConflictException("Unknown predecessor version", "unknown_predecessor")
        val legalId = predecessor.legalVersionId ?: throw ConflictException("Unknown predecessor version", "unknown_predecessor")
        return successor(constitutionId, id, predecessorId, legalId, hop)
    }

    /** Corrections retain legal identity and follow its editorial tip; legal successors follow the legal tip. */
    private fun successor(constitutionId: UUID, id: UUID, predecessorId: UUID, predecessorLegalId: UUID, hop: String): CatalogVersionChain = when (hop) {
        "editorial_correction" -> {
            val tip = catalog.findEditorialTipId(predecessorLegalId)
            if (predecessorId != tip) throw ConflictException("Predecessor is not the editorial tip of this legal version", "not_editorial_tip")
            CatalogVersionChain(hop, "staff", predecessorLegalId, null, predecessorId)
        }
        "legal" -> {
            val tip = catalog.findLegalTipEditorialTipId(constitutionId)
            if (predecessorId != tip) throw ConflictException("Predecessor is not the editorial tip of the current legal tip", "not_legal_tip")
            CatalogVersionChain(hop, "public", id, predecessorId, null)
        }
        else -> throw IllegalArgumentException("hopKind must be one of: legal, editorial_correction")
    }

    /** Source inheritance/validation remains inside the insert try block with unchanged integrity-conflict mapping. */
    private fun insert(id: UUID, constitutionId: UUID, label: String, request: CreateVersionRequest, chain: CatalogVersionChain) {
        val predecessorId = request.predecessorVersionId
        try {
            catalog.insertDraftVersion(
                id, constitutionId, label, request.effectiveDate, request.languageCode, request.sourceUrl, request.gazetteReference,
                request.publicationComment?.trim()?.ifBlank { null }, predecessorId, chain.hopKind, chain.listing, chain.legalVersionId, chain.legalPredecessorId, chain.editorialPredecessorId,
                (request.sourceEvidence ?: if (chain.hopKind == "editorial_correction") predecessorId?.let { catalog.findVersion(it)?.sourceEvidence } else null)?.also { it.validate() },
            )
        } catch (ex: DataIntegrityViolationException) {
            if (chain.hopKind == "editorial_correction") throw ConflictException("Predecessor is not the editorial tip of this legal version", "not_editorial_tip")
            if (predecessorId != null) throw ConflictException("Predecessor is not the editorial tip of the current legal tip", "not_legal_tip")
            throw ex
        }
    }

    /** Import hold, explicit settings check, pin and publish receipt retain their durable-write order. */
    private fun pin(id: UUID, constitutionId: UUID, request: CreateVersionRequest, hash: String) {
        request.importJobId?.let { catalog.holdImportedVersion(id, it) }
        request.structuralSettingsRevisionId?.let { settings.find(constitutionId, it) }
        settings.pin(id, constitutionId, request.predecessorVersionId, request.structuralSettingsRevisionId)
        request.publishAttemptId?.let { attempts.insert(it, constitutionId, id, hash) }
    }

    /** Preserves reservation hashes predating the optional source-evidence description field. */
    private fun legacySourceRequestHash(request: CreateVersionRequest): String? {
        val source = request.sourceEvidence?.takeIf { it.description == null } ?: return null
        val evidence = "SourceEvidence(dateWording=${source.dateWording}, datePrecision=${source.datePrecision}, coverage=${source.coverage}, statusWording=${source.statusWording}, attribution=${source.attribution})"
        val original = "CreateVersionRequest(versionLabel=${request.versionLabel}, effectiveDate=${request.effectiveDate}, languageCode=${request.languageCode}, sourceUrl=${request.sourceUrl}, gazetteReference=${request.gazetteReference}, predecessorVersionId=${request.predecessorVersionId}, hopKind=${request.hopKind}, publicationComment=${request.publicationComment}, structuralSettingsRevisionId=${request.structuralSettingsRevisionId}, publishAttemptId=${request.publishAttemptId}, importJobId=${request.importJobId}, sourceEvidence=$evidence)"
        return digest(original)
    }

    /** Older corrections omitted evidence that Catalog inherited unchanged from a published predecessor. */
    private fun inheritedSourceRequestHash(request: CreateVersionRequest): String? {
        val evidence = request.sourceEvidence ?: return null
        if (request.hopKind != "editorial_correction") return null
        val predecessor = request.predecessorVersionId?.let(catalog::findVersion) ?: return null
        if (predecessor.publicationStatus != "published" || predecessor.sourceEvidence != evidence) return null
        return digest(request.copy(sourceEvidence = null).toString())
    }

    /** Kotlin's existing default UTF-8 encoding and lowercase SHA-256 representation stay unchanged. */
    private fun digest(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}

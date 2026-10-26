package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.CreateProvisionLifecycleEvent
import com.constitutionatlas.catalog.api.ProvisionLifecycleEvent
import com.constitutionatlas.catalog.client.ProvisionScope
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.catalog.repo.ProvisionLifecycleRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class ProvisionLifecycleService(
    private val catalog: CatalogRepository,
    private val repo: ProvisionLifecycleRepository,
    private val scope: ProvisionScope,
) {
    fun events(constitutionId: UUID): List<ProvisionLifecycleEvent> {
        if (!catalog.constitutionExists(constitutionId)) throw NotFoundException("Unknown constitution '$constitutionId'")
        return repo.events(constitutionId)
    }

    fun countryEvents(isoCode: String): List<ProvisionLifecycleEvent> {
        if (catalog.findCountrySummary(isoCode) == null) throw NotFoundException("Unknown country '$isoCode'")
        return repo.countryEvents(isoCode)
    }

    @Transactional
    fun append(constitutionId: UUID, request: CreateProvisionLifecycleEvent, actorId: UUID): ProvisionLifecycleEvent {
        if (!catalog.lockConstitution(constitutionId)) throw NotFoundException("Unknown constitution '$constitutionId'")
        val kind = request.eventType.trim().lowercase()
        require(kind in setOf("deferred", "commenced", "suspended", "restored")) { "Unsupported provision lifecycle event" }
        require(request.logicalUnitIds.isNotEmpty() && request.logicalUnitIds.size <= 100 && request.logicalUnitIds.distinct().size == request.logicalUnitIds.size) {
            "Provide 1–100 distinct logical unit IDs"
        }
        val version = catalog.findVersion(request.sourceVersionId)
        if (version == null || version.constitutionId != constitutionId || version.publicationStatus != "published") {
            throw ConflictException("Scope version must be a published version of this constitution", "invalid_scope_version")
        }
        scope.requireUnits(request.sourceVersionId, request.logicalUnitIds)
        val wholeStatus = catalog.lifecycleLegalStatus(constitutionId, request.eventDate)
        if (kind == "deferred" && wholeStatus != "awaiting_commencement") {
            throw ConflictException("A deferred provision must be recorded before constitution commencement", "invalid_provision_timing")
        }
        if (kind != "deferred" && wholeStatus != "in_force") {
            throw ConflictException("A provision event requires the constitution to be in force", "invalid_provision_timing")
        }
        val priorEvents = repo.events(constitutionId)
        request.logicalUnitIds.forEach { unitId ->
            val previous = priorEvents.lastOrNull { unitId in it.logicalUnitIds }
            if (previous != null && !request.eventDate.isAfter(previous.eventDate)) {
                throw ConflictException("Provision event must follow its previous event", "invalid_provision_chronology")
            }
            val allowed = when (previous?.eventType) {
                null -> setOf("deferred", "suspended")
                "deferred" -> setOf("commenced")
                "commenced", "restored" -> setOf("suspended")
                "suspended" -> setOf("restored")
                else -> emptySet()
            }
            if (kind !in allowed) throw ConflictException("Invalid provision lifecycle transition", "invalid_provision_transition")
        }
        if (request.sourceUrl != null && !request.sourceUrl.startsWith("https://") && !request.sourceUrl.startsWith("http://")) {
            throw IllegalArgumentException("sourceUrl must be an HTTP(S) URL")
        }
        return repo.insert(constitutionId, request.copy(eventType = kind), actorId)
    }
}

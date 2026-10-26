package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.CreateLifecycleEvent
import com.constitutionatlas.catalog.api.LifecycleEvent
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.catalog.repo.LifecycleRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.util.UUID

@Service
class LifecycleService(
    private val catalog: CatalogRepository,
    private val lifecycle: LifecycleRepository,
) {
    fun events(constitutionId: UUID): List<LifecycleEvent> {
        if (!catalog.constitutionExists(constitutionId)) throw NotFoundException("Unknown constitution '$constitutionId'")
        return lifecycle.events(constitutionId)
    }

    fun countryEvents(isoCode: String): List<LifecycleEvent> {
        if (catalog.findCountrySummary(isoCode) == null) throw NotFoundException("Unknown country '$isoCode'")
        return lifecycle.countryEvents(isoCode)
    }

    fun status(constitutionId: UUID, on: LocalDate): String {
        if (!catalog.constitutionExists(constitutionId)) throw NotFoundException("Unknown constitution '$constitutionId'")
        return catalog.lifecycleStatus(constitutionId, on)
    }

    @Transactional
    fun append(constitutionId: UUID, request: CreateLifecycleEvent, actorId: UUID): LifecycleEvent {
        if (!catalog.lockConstitution(constitutionId)) throw NotFoundException("Unknown constitution '$constitutionId'")
        val kind = request.eventType.trim().lowercase()
        require(request.dateCertainty in setOf("exact", "approximate")) { "Invalid lifecycle date certainty" }
        val events = lifecycle.events(constitutionId)
        val previous = events.lastOrNull()
        if (previous != null && !request.eventDate.isAfter(previous.eventDate)) {
            throw ConflictException("Lifecycle event date must follow the previous event", "invalid_lifecycle_chronology")
        }
        val allowed = when (previous?.eventType) {
            null -> setOf("adopted")
            "adopted" -> setOf("commenced", "repealed")
            "commenced", "restored" -> setOf("suspended", "repealed")
            "suspended" -> setOf("restored", "repealed")
            else -> emptySet()
        }
        if (kind !in allowed) throw ConflictException("Invalid constitution lifecycle transition", "invalid_lifecycle_transition")
        val sourceUrl = request.sourceUrl?.trim()?.takeIf { it.isNotEmpty() }
        if (sourceUrl != null && !(sourceUrl.startsWith("https://") || sourceUrl.startsWith("http://"))) {
            throw IllegalArgumentException("sourceUrl must be an HTTP(S) URL")
        }
        return lifecycle.insert(constitutionId, kind, request.eventDate, sourceUrl, request.note?.trim(), request.dateCertainty, actorId)
    }
}

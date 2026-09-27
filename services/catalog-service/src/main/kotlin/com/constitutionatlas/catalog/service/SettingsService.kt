package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.api.SettingsImpact
import com.constitutionatlas.catalog.api.SettingsRevision
import com.constitutionatlas.catalog.api.SettingsWrite
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.catalog.repo.SettingsRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class SettingsService(private val catalog: CatalogRepository, private val settings: SettingsRepository) {
    fun current(constitutionId: UUID): SettingsRevision =
        settings.find(
            constitutionId,
            settings.currentId(constitutionId)
                ?: throw NotFoundException("Unknown constitution '$constitutionId'"),
        )

    fun revision(constitutionId: UUID, revisionId: UUID): SettingsRevision = settings.find(constitutionId, revisionId)

    fun forVersion(versionId: UUID): SettingsRevision = settings.forVersion(versionId)

    fun impact(constitutionId: UUID, kinds: List<OutlineKindWrite>): SettingsImpact {
        if (!catalog.constitutionExists(constitutionId)) throw NotFoundException("Unknown constitution '$constitutionId'")
        val proposed = CatalogWriteService.normalizeOutline(kinds)
        val existing = catalog.findOutline(constitutionId).kinds
        val versions = catalog.listAllVersionIds(constitutionId)
        val reasons = mutableListOf<String>()
        if (existing.map { it.kindCode } != proposed.map { it.kindCode }) {
            reasons.add("Changing occupied hierarchy requires a reviewed successor migration")
        }
        proposed.forEach { kind ->
            val old = existing.find { it.kindCode == kind.kindCode } ?: return@forEach
            if (old.allowTextAlongsideChildren && !kind.allowTextAlongsideChildren) {
                reasons.add("${kind.kindCode}: removing parent-text permission requires content validation")
            }
            if (old.titlePolicy != kind.titlePolicy && kind.titlePolicy != "optional") {
                reasons.add("${kind.kindCode}: stricter title policy requires content validation")
            }
            if (old.labelPolicy != kind.labelPolicy && kind.labelPolicy != "optional") {
                reasons.add("${kind.kindCode}: stricter literal-label policy requires content validation")
            }
            if (old.segmentation != kind.segmentation) {
                reasons.add("${kind.kindCode}: changing segmentation requires a reviewed successor")
            }
        }
        return SettingsImpact(
            settings.currentId(constitutionId),
            if (versions.isNotEmpty() && reasons.isNotEmpty()) "migration_required" else "safely_reversible",
            versions,
            if (versions.isNotEmpty()) reasons else emptyList(),
        )
    }

    @Transactional
    fun save(constitutionId: UUID, request: SettingsWrite): SettingsRevision {
        val current = settings.currentId(constitutionId, lock = true)
        if (current != request.expectedRevisionId) throw ConflictException("Settings changed; reload the impact preview", "stale_settings")
        val impact = impact(constitutionId, request.kinds)
        if (impact.classification == "migration_required") {
            throw ConflictException(impact.reasons.joinToString("; "), "settings_migration_required")
        }
        catalog.replaceOutline(constitutionId, CatalogWriteService.normalizeOutline(request.kinds))
        val id = settings.append(constitutionId, catalog.findOutline(constitutionId))
        return settings.find(constitutionId, id)
    }
}

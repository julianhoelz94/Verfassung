package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.api.SettingsImpact
import com.constitutionatlas.catalog.api.SettingsRevision
import com.constitutionatlas.catalog.api.SettingsWrite
import com.constitutionatlas.catalog.client.SettingsUsageClient
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.catalog.repo.SettingsRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class SettingsService(private val catalog: CatalogRepository, private val settings: SettingsRepository, private val usage: SettingsUsageClient) {
    fun current(constitutionId: UUID): SettingsRevision =
        settings.find(
            constitutionId,
            settings.currentId(constitutionId)
                ?: throw NotFoundException("Unknown constitution '$constitutionId'"),
        )

    fun revision(constitutionId: UUID, revisionId: UUID): SettingsRevision = settings.find(constitutionId, revisionId)

    fun forVersion(versionId: UUID): SettingsRevision = settings.forVersion(versionId)

    fun impact(constitutionId: UUID, kinds: List<OutlineKindWrite>, authorization: String? = null): SettingsImpact {
        if (!catalog.constitutionExists(constitutionId)) throw NotFoundException("Unknown constitution '$constitutionId'")
        val proposed = CatalogWriteService.normalizeOutline(kinds)
        val unchangedStructure = structuralRules(proposed) == structuralRules(currentKinds(constitutionId))
        val versions = catalog.listAllVersionIds(constitutionId)
        val reasons = mutableListOf<String>()
        val inspected = usage.inspect(versions, proposed, authorization)
        if (!unchangedStructure && inspected.violations.isNotEmpty()) reasons.add("Stored content violates the proposed settings")
        return SettingsImpact(
            settings.currentId(constitutionId),
            if (versions.isNotEmpty() && reasons.isNotEmpty()) "migration_required" else "safely_reversible",
            versions,
            if (versions.isNotEmpty()) reasons else emptyList(),
            inspected.draftSessionIds,
            if (unchangedStructure) emptyList() else inspected.violations,
        )
    }

    fun reader(versionId: UUID): com.constitutionatlas.catalog.api.ContentOutlineDto {
        val pinned = forVersion(versionId)
        val version = catalog.findVersion(versionId) ?: throw NotFoundException("Unknown version")
        val presentation = current(version.constitutionId).outline.kinds.associateBy { it.kindCode }
        return pinned.outline.copy(
            kinds = pinned.outline.kinds.map { kind ->
                val live = presentation[kind.kindCode] ?: return@map kind
                kind.copy(
                    displayLabel = live.displayLabel,
                    presentation = live.presentation,
                    showLabel = live.showLabel,
                    showTitle = live.showTitle,
                    showKind = live.showKind,
                    labelPlacement = live.labelPlacement,
                )
            },
        )
    }

    private fun structuralRules(kinds: List<OutlineKindWrite>): List<List<Any?>> = kinds.map { kind ->
        listOf(kind.kindCode, kind.allowTextAlongsideChildren, kind.titlePolicy, kind.labelPolicy, kind.segmentation)
    }

    private fun currentKinds(constitutionId: UUID): List<OutlineKindWrite> = CatalogWriteService.normalizeOutline(
        current(constitutionId).outline.kinds.map { kind ->
            OutlineKindWrite(
                kind.kindCode, kind.displayLabel, kind.presentation, kind.showLabel, kind.showTitle, kind.showKind,
                kind.allowTextAlongsideChildren, kind.titlePolicy, kind.labelPolicy, kind.labelPlacement, kind.segmentation,
            )
        },
    )

    @Transactional
    fun restore(constitutionId: UUID, revisionId: UUID, expectedRevisionId: UUID, authorization: String?): SettingsRevision {
        val old = revision(constitutionId, revisionId)
        return save(
            constitutionId,
            SettingsWrite(
                expectedRevisionId,
                old.outline.kinds.map { kind ->
                    OutlineKindWrite(
                        kind.kindCode, kind.displayLabel, kind.presentation, kind.showLabel, kind.showTitle, kind.showKind,
                        kind.allowTextAlongsideChildren, kind.titlePolicy, kind.labelPolicy, kind.labelPlacement, kind.segmentation,
                    )
                },
            ),
            authorization,
        )
    }

    @Transactional
    fun save(constitutionId: UUID, request: SettingsWrite, authorization: String? = null): SettingsRevision {
        val current = settings.currentId(constitutionId, lock = true)
        if (current != request.expectedRevisionId) throw ConflictException("Settings changed; reload the impact preview", "stale_settings")
        // Repeated imports must not reinterpret already pinned legacy content as a settings migration.
        if (CatalogWriteService.normalizeOutline(request.kinds) == currentKinds(constitutionId)) return settings.find(constitutionId, current)
        val impact = impact(constitutionId, request.kinds, authorization)
        if (impact.classification == "migration_required") {
            throw ConflictException(impact.reasons.joinToString("; "), "settings_migration_required")
        }
        catalog.replaceOutline(constitutionId, CatalogWriteService.normalizeOutline(request.kinds))
        val id = settings.append(constitutionId, catalog.findOutline(constitutionId))
        return settings.find(constitutionId, id)
    }
}

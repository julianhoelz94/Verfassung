package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.client.ResolvedContentUnit
import com.constitutionatlas.amendment.client.toAmendmentRef
import java.util.UUID

/** Resolves caller selections in snapshot order, retaining the original first-failure diagnostics. */
internal class AmendmentReferenceResolver(
    private val content: ContentClient,
    private val constitutionId: UUID,
    private val allowDraftTarget: Boolean,
) {
    /** A draft after-selection has no snapshot; published selections must match the expected pin. */
    fun resolve(ref: AmendmentUnitRefDto?, expectedVersion: UUID?, side: String): AmendmentUnitRefDto? {
        if (ref == null) return null
        val versionId = ref.versionId ?: return withoutSnapshot(ref, expectedVersion, side)
        if (expectedVersion == null || versionId != expectedVersion) throw IllegalArgumentException("$side reference is not pinned to this change record's snapshot")
        val logicalId = ref.logicalId ?: throw IllegalArgumentException("$side reference needs a logical unit")
        val resolved = content.resolve(versionId, logicalId) ?: throw IllegalArgumentException("$side reference is not in its pinned snapshot")
        return verifyResolved(ref, resolved, side)
    }

    /** Discards untrusted draft projections after requiring a logical identity and valid optional kind. */
    private fun withoutSnapshot(ref: AmendmentUnitRefDto, expectedVersion: UUID?, side: String): AmendmentUnitRefDto {
        if (side != "After" || expectedVersion != null || !allowDraftTarget) throw IllegalArgumentException("$side reference needs a version")
        val logicalId = ref.logicalId ?: throw IllegalArgumentException("$side draft reference needs a logical unit")
        val kind = ref.unitKind
        if (kind != null && kind !in setOf("node", "text_entry")) throw IllegalArgumentException("$side draft reference has an invalid unit kind")
        return AmendmentUnitRefDto(logicalId = logicalId, unitKind = kind)
    }

    /** Ownership, occurrence, revision and kind checks precede copying trusted Content projections. */
    private fun verifyResolved(ref: AmendmentUnitRefDto, resolved: ResolvedContentUnit, side: String): AmendmentUnitRefDto {
        if (resolved.constitutionId != constitutionId) throw IllegalArgumentException("$side reference belongs to another constitution")
        if (ref.occurrenceId != null && ref.occurrenceId != resolved.occurrenceId) throw IllegalArgumentException("$side reference occurrence does not match the pinned snapshot")
        if (ref.revisionId != null && ref.revisionId != resolved.revisionId) throw IllegalArgumentException("$side reference revision does not match the pinned snapshot")
        val unitKind = if (resolved.kind == "parent_text") "text_entry" else "node"
        if (ref.unitKind != null && ref.unitKind != unitKind) throw IllegalArgumentException("$side reference has the wrong unit kind")
        return resolved.toAmendmentRef(unitKind)
    }
}

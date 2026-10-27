package com.constitutionatlas.editor.api

import com.constitutionatlas.platform.SourceEvidence
import java.time.Instant
import java.util.UUID

data class SaveSourceEvidenceRequest(val expectedRevision: Int, val evidence: SourceEvidence, val reason: String)

data class SourceEvidenceChangesRequest(val expectedRevision: Int, val reason: String)

data class SourceEvidenceReviewRequest(val sourceEvidenceRevision: Int? = null)

data class SourceEvidenceRevisionDto(
    val id: UUID,
    val revision: Int,
    val original: SourceEvidence?,
    val evidence: SourceEvidence,
    val reason: String,
    val actorId: UUID,
    val actorEmail: String,
    val createdAt: Instant,
)

data class SourceEvidenceDecisionDto(
    val id: UUID,
    val revision: Int,
    val action: String,
    val actorId: UUID,
    val actorEmail: String,
    val reason: String?,
    val createdAt: Instant,
)

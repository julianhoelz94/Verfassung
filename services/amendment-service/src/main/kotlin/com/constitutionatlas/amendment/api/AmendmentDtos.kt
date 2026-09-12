package com.constitutionatlas.amendment.api

import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// Callers: AmendmentController, AmendmentService, AmendmentRepository, AmendmentApiTest.
// Unique DTO set for amendment-service. Public JSON drops kind; adds comment, documents, reviewStatus.
// User instruction: "Work on Sprint 36"

data class AmendmentChangeDto(
    val id: UUID,
    val articleId: UUID?,
    val articleNumber: String?,
    val changeType: String,
    val note: String?,
    val nodeId: UUID?,
    val changedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val amendingLawCitationId: UUID?,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val amendingLawTitle: String? = null,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val amendingLawCitation: String? = null,
)

data class AmendmentDocumentDto(
    val url: String? = null,
    val fileId: String? = null,
    val label: String? = null,
)

data class AmendmentDto(
    val id: UUID,
    val constitutionId: UUID,
    val status: String,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val transitionId: UUID? = null,
    val title: String,
    val comment: String,
    val documents: List<AmendmentDocumentDto> = emptyList(),
    val enactedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val sourceVersionId: UUID?,
    val targetVersionId: UUID?,
    val publishedRevisionId: UUID? = null,
    val changes: List<AmendmentChangeDto>,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val reviewStatus: String? = null,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val reviewedSourceTipId: UUID? = null,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val reviewedTargetTipId: UUID? = null,
)

data class AmendmentChangeWriteRequest(
    val articleNumber: String? = null,
    val changeType: String,
    val note: String? = null,
    val articleId: UUID? = null,
    val nodeId: UUID? = null,
    val changedOn: LocalDate? = null,
    val effectiveOn: LocalDate? = null,
    val amendingLawTitle: String? = null,
    val amendingLawCitation: String? = null,
)

data class AmendmentWriteRequest(
    val kind: String? = null,
    val title: String,
    val comment: String? = null,
    val documents: List<AmendmentDocumentDto> = emptyList(),
    val enactedOn: LocalDate? = null,
    val effectiveOn: LocalDate? = null,
    val sourceVersionId: UUID? = null,
    val targetVersionId: UUID? = null,
    val changes: List<AmendmentChangeWriteRequest> = emptyList(),
)

data class LinkTargetRequest(
    val sourceVersionId: UUID? = null,
    val targetVersionId: UUID,
)

data class SuggestRequest(
    val sourceVersionId: UUID,
    val targetVersionId: UUID,
)

data class SuggestedChangeDto(
    val articleNumber: String?,
    val changeType: String,
    val note: String?,
    val nodeId: UUID?,
    val articleId: UUID?,
)

data class SuggestResponse(
    val changes: List<SuggestedChangeDto>,
)

data class AmendmentRevisionDto(
    val id: UUID,
    val predecessorRevisionId: UUID?,
    val createdBy: UUID?,
    val createdAt: Instant,
    val title: String,
    val comment: String,
    val documents: List<AmendmentDocumentDto> = emptyList(),
    val enactedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val sourceVersionId: UUID?,
    val targetVersionId: UUID?,
    val changes: List<AmendmentChangeDto>,
    val reviewedSourceTipId: UUID? = null,
    val reviewedTargetTipId: UUID? = null,
)

data class TransitionRequest(
    val sourceVersionId: UUID,
    val targetVersionId: UUID,
    val changedOn: LocalDate? = null,
    val effectiveOn: LocalDate? = null,
    val amendingLawTitle: String? = null,
    val amendingLawCitation: String? = null,
)

data class RefreshReviewStatusRequest(
    val legalVersionId: UUID,
)

data class RefreshReviewStatusResponse(
    val flaggedAmendmentIds: List<UUID>,
)

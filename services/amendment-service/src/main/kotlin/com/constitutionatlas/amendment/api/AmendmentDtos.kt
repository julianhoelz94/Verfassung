package com.constitutionatlas.amendment.api

import com.fasterxml.jackson.annotation.JsonInclude
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

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

data class AmendmentDto(
    val id: UUID,
    val constitutionId: UUID,
    val kind: String,
    val status: String,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val transitionId: UUID? = null,
    val title: String,
    val summary: String,
    val enactedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val sourceReference: String?,
    val sourceVersionId: UUID?,
    val targetVersionId: UUID?,
    val publishedRevisionId: UUID? = null,
    val changes: List<AmendmentChangeDto>,
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
    val summary: String? = null,
    val enactedOn: LocalDate? = null,
    val effectiveOn: LocalDate? = null,
    val sourceReference: String? = null,
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
    val summary: String,
    val enactedOn: LocalDate?,
    val effectiveOn: LocalDate?,
    val sourceReference: String?,
    val sourceVersionId: UUID?,
    val targetVersionId: UUID?,
    val changes: List<AmendmentChangeDto>,
)

data class TransitionRequest(
    val sourceVersionId: UUID,
    val targetVersionId: UUID,
    val changedOn: LocalDate? = null,
    val effectiveOn: LocalDate? = null,
    val amendingLawTitle: String? = null,
    val amendingLawCitation: String? = null,
)

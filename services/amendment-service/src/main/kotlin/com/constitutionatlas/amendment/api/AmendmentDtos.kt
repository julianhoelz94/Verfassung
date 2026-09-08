package com.constitutionatlas.amendment.api

import com.fasterxml.jackson.annotation.JsonInclude
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
    val title: String,
    val summary: String,
    val enactedOn: LocalDate?,
    val sourceReference: String?,
    val sourceVersionId: UUID,
    val targetVersionId: UUID,
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

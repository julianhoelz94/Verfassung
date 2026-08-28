package com.constitutionatlas.amendment.api

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

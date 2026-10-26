package com.constitutionatlas.catalog.api

import com.constitutionatlas.platform.StrictOrderedWrite
import java.util.UUID

data class ComparisonColumn(val constitutionId: UUID, val versionId: UUID, val label: String) : StrictOrderedWrite()
data class ComparisonPassage(val column: Int, val logicalId: UUID) : StrictOrderedWrite()
data class ComparisonTopic(val title: String, val passages: List<ComparisonPassage>, val missingColumns: List<Int> = emptyList()) : StrictOrderedWrite()
data class CreateCuratedComparison(
    val attemptId: UUID,
    val title: String,
    val attribution: String,
    val sourceUrl: String,
    val sourceDocumentId: UUID,
    val sourceDocumentRevision: Int,
    val columns: List<ComparisonColumn>,
    val topics: List<ComparisonTopic>,
) : StrictOrderedWrite()
data class CuratedComparison(val id: UUID, val state: String, val definition: CreateCuratedComparison, val needsReview: Boolean, val reviewReason: String?)
data class ComparisonReviewRequest(val reason: String) : StrictOrderedWrite()

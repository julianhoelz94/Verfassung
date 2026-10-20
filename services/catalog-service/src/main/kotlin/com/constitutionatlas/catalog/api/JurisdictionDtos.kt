package com.constitutionatlas.catalog.api

import java.time.LocalDate
import java.util.UUID

data class JurisdictionSummary(
    val id: UUID,
    val parentId: UUID?,
    val slug: String,
    val name: String,
    val kind: String,
    val code: String?,
    val historical: Boolean = false,
    val existedFrom: LocalDate? = null,
    val existedUntil: LocalDate? = null,
)

data class JurisdictionDetail(
    val jurisdiction: JurisdictionSummary,
    val ancestors: List<JurisdictionSummary>,
    val children: List<JurisdictionSummary>,
    val constitutions: List<ConstitutionSummary>,
)

data class CreateJurisdictionRequest(
    val slug: String,
    val name: String,
    val kind: String,
    val parentId: UUID? = null,
    val code: String? = null,
    val historical: Boolean = false,
    val existedFrom: LocalDate? = null,
    val existedUntil: LocalDate? = null,
)

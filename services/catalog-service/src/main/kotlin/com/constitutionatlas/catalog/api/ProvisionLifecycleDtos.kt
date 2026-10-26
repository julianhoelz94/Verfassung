package com.constitutionatlas.catalog.api

import java.time.LocalDate
import java.util.UUID

data class ProvisionLifecycleEvent(
    val id: UUID,
    val constitutionId: UUID,
    val sourceVersionId: UUID,
    val eventType: String,
    val eventDate: LocalDate,
    val logicalUnitIds: List<UUID>,
    val sourceUrl: String?,
    val note: String?,
)

data class CreateProvisionLifecycleEvent(
    val sourceVersionId: UUID,
    val eventType: String,
    val eventDate: LocalDate,
    val logicalUnitIds: List<UUID>,
    val sourceUrl: String? = null,
    val note: String? = null,
)

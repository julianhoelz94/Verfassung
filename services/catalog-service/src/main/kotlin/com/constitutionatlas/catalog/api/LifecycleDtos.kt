package com.constitutionatlas.catalog.api

import java.time.LocalDate
import java.util.UUID

data class LifecycleEvent(
    val id: UUID,
    val constitutionId: UUID,
    val eventType: String,
    val eventDate: LocalDate,
    val sourceUrl: String?,
    val note: String?,
    val dateCertainty: String = "exact",
)

data class CreateLifecycleEvent(
    val eventType: String,
    val eventDate: LocalDate,
    val sourceUrl: String? = null,
    val note: String? = null,
    val dateCertainty: String = "exact",
)

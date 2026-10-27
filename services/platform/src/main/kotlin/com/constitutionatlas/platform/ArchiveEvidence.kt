package com.constitutionatlas.platform

import java.util.UUID

/** Source descriptions do not assert a legal commencement date or present validity. */
data class SourceEvidence(
    val dateWording: String? = null,
    val datePrecision: String = "unknown",
    val coverage: String? = null,
    val statusWording: String? = null,
    val attribution: String? = null,
    @get:com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    val description: String? = null,
) : StrictOrderedWrite() {
    fun validate() {
        require(datePrecision in setOf("unknown", "year", "month", "day", "range", "uncertain")) { "Unsupported source date precision" }
        require(datePrecision == "unknown" || !dateWording.isNullOrBlank()) { "Source date precision requires original date wording" }
        require(listOf(dateWording, coverage, statusWording, attribution).all { it == null || it.length <= 10000 }) { "Source evidence exceeds 10000 characters" }
        require(description == null || description.length <= 50000) { "Source description exceeds 50000 characters" }
    }
}

data class OrderedAnnotation(
    val kind: String,
    val attribution: String? = null,
    val sourceUrl: String? = null,
    val anchorLogicalIds: List<UUID> = emptyList(),
) : StrictOrderedWrite() {
    fun validate() {
        require(kind in setOf("source", "editorial", "amendment")) { "Unsupported annotation kind" }
        require(attribution == null || attribution.length <= 10000) { "Annotation attribution exceeds limit" }
        require(sourceUrl == null || (sourceUrl.startsWith("https://") && sourceUrl.length <= 2048)) { "Annotation citation must use HTTPS" }
        require(anchorLogicalIds.size <= 100 && anchorLogicalIds.distinct().size == anchorLogicalIds.size) { "Invalid annotation anchors" }
    }
}

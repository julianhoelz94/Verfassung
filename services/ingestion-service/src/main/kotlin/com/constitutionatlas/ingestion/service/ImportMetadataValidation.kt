package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportRequest

/** Validates request-level provenance and format selection before inspecting content. */
internal object ImportMetadataValidation {
    private val manifestResources = setOf("units", "textEntries", "tables", "cells", "footnotes", "references", "documents")

    /** Collects all metadata failures in the established API order without normalizing input. */
    fun errors(request: ImportRequest): List<Pair<String, String>> = buildList {
        if (request.expectedCounts?.any { (key, value) -> key !in manifestResources || value < 0 } == true) {
            add("MANIFEST_COUNTS" to "Manifest counts must name supported nonnegative resource counts")
        }
        runCatching { request.sourceEvidence?.validate() }.exceptionOrNull()?.let {
            add("SOURCE_EVIDENCE" to (it.message ?: "Invalid source evidence"))
        }
        addAll(jurisdictionErrors(request))
        if (request.constitutionSlug.isBlank()) add("MISSING_SLUG" to "constitutionSlug is required")
        if (request.versionLabel.isBlank()) add("MISSING_VERSION" to "versionLabel is required")
        if (request.sourceUrl.isNullOrBlank() && request.gazetteReference.isNullOrBlank()) {
            add("MISSING_SOURCE" to "sourceUrl or gazetteReference is required")
        }
        if (request.sourceUrl != null && !request.sourceUrl.startsWith("https://")) {
            add("INVALID_SOURCE_URL" to "sourceUrl must use HTTPS")
        }
        if (request.articles.isEmpty() && request.roots.isEmpty()) add("NO_ARTICLES" to "at least one article is required")
        if (request.articles.isNotEmpty() && request.roots.isNotEmpty()) add("MIXED_FORMATS" to "Use roots or articles, not both")
    }

    /** Existing jurisdiction IDs bypass country creation fields; supplying both selectors is ambiguous. */
    private fun jurisdictionErrors(request: ImportRequest): List<Pair<String, String>> = buildList {
        if (request.jurisdictionId != null && request.isoCode.isNotBlank()) {
            add("AMBIGUOUS_JURISDICTION" to "Use jurisdictionId or isoCode, not both")
        }
        if (request.jurisdictionId == null && !request.isoCode.matches(Regex("[A-Za-z]{2}"))) {
            add("INVALID_ISO" to "isoCode must be two letters")
        }
        if (request.jurisdictionId == null && request.countryName.isBlank()) add("MISSING_COUNTRY" to "countryName is required")
    }
}

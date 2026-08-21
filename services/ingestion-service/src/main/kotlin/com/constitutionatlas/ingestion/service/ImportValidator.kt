package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportRequest

object ImportValidator {
    fun validate(request: ImportRequest): List<Pair<String, String>> {
        val errors = mutableListOf<Pair<String, String>>()
        if (request.isoCode.trim().length != 2) {
            errors += "INVALID_ISO" to "isoCode must be two letters"
        }
        if (request.countryName.isBlank()) {
            errors += "MISSING_COUNTRY" to "countryName is required"
        }
        if (request.constitutionSlug.isBlank()) {
            errors += "MISSING_SLUG" to "constitutionSlug is required"
        }
        if (request.versionLabel.isBlank()) {
            errors += "MISSING_VERSION" to "versionLabel is required"
        }
        if (request.articles.isEmpty()) {
            errors += "NO_ARTICLES" to "at least one article is required"
        }
        val numbers = request.articles.map { it.articleNumber.trim() }
        if (numbers.any { it.isBlank() }) {
            errors += "BLANK_NUMBER" to "articleNumber must not be blank"
        }
        if (numbers.filter { it.isNotBlank() }.let { it.size != it.toSet().size }) {
            errors += "DUPLICATE_NUMBER" to "article numbers must be unique"
        }
        val orders = request.articles.map { it.sortOrder }
        if (orders.toSet().size != orders.size) {
            errors += "DUPLICATE_ORDER" to "sortOrder values must be unique"
        }
        if (orders.any { it < 1 }) {
            errors += "INVALID_ORDER" to "sortOrder must be >= 1"
        }
        val expected = (1..request.articles.size).toSet()
        if (request.articles.isNotEmpty() && orders.toSet() != expected) {
            errors += "ORDER_GAPS" to "sortOrder must be a contiguous sequence starting at 1"
        }
        return errors
    }
}

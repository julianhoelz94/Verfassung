package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportNode
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.platform.Actor
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

object ImportValidator {
    private val DEFAULT_KINDS = setOf("article")

    fun requireConfirmedPinForScopedUpload(actor: Actor, request: ImportRequest) {
        if ("ingestion:import" in actor.scopes && actor.roles.none { it == "editor" || it == "admin" }) {
            if (request.constitutionId == null || request.settingsRevisionId == null || request.outline != null) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Full upload requires a confirmed constitutionId and settingsRevisionId; omit outline")
            }
        }
    }

    fun validate(request: ImportRequest, pinnedOutline: ImportOutline? = null): List<Pair<String, String>> {
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
        if (request.articles.isEmpty() && request.roots.isEmpty()) {
            errors += "NO_ARTICLES" to "at least one article is required"
        }
        if (request.articles.isNotEmpty() && request.roots.isNotEmpty()) errors += "MIXED_FORMATS" to "Use roots or articles, not both"
        if (request.roots.isNotEmpty()) {
            val rootKind = (pinnedOutline ?: request.outline)?.kinds?.firstOrNull()?.kindCode ?: "article"
            if (request.roots.any { it.kind != rootKind }) errors += "ROOT_KIND" to "Roots must use the first outline kind '$rootKind'"
            val allowed = allowedKinds(request, pinnedOutline)
            val logicalIds = mutableSetOf<java.util.UUID>()
            fun visit(node: com.constitutionatlas.platform.OrderedNodeWrite) {
                val kind = node.kind?.trim()?.lowercase().orEmpty()
                if (kind !in allowed) errors += "UNKNOWN_KIND" to "kind '$kind' is not in the outline"
                if (node.revisionId != null || node.predecessorRevisionId != null) errors += "REVISION_REFERENCE" to "Imports must contain complete units without foreign revision references"
                if (node.logicalId != null && !logicalIds.add(requireNotNull(node.logicalId))) errors += "DUPLICATE_LOGICAL_ID" to "Logical identities must be unique"
                node.content.orEmpty().forEach { entry ->
                    entry.node?.let(::visit)
                    if (entry.logicalId != null && !logicalIds.add(requireNotNull(entry.logicalId))) errors += "DUPLICATE_LOGICAL_ID" to "Logical identities must be unique"
                    if (entry.revisionId != null || entry.predecessorRevisionId != null || entry.lineage.isNotEmpty()) errors += "REVISION_REFERENCE" to "Imports cannot refer to foreign revisions"
                }
            }
            request.roots.forEach(::visit)
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
        unknownKinds(request, pinnedOutline).distinct().forEach { kind ->
            errors += "UNKNOWN_KIND" to "kind '$kind' is not in the outline"
        }
        return errors
    }

    fun allowedKinds(request: ImportRequest, pinnedOutline: ImportOutline? = null): Set<String> {
        val fromOutline =
            (pinnedOutline ?: request.outline)
                ?.kinds
                .orEmpty()
                .map { it.kindCode.trim().lowercase() }
                .filter { it.isNotBlank() }
        return if (fromOutline.isEmpty()) DEFAULT_KINDS else fromOutline.toSet()
    }

    private fun unknownKinds(request: ImportRequest, pinnedOutline: ImportOutline?): List<String> {
        val allowed = allowedKinds(request, pinnedOutline)
        return request.articles.flatMap { article -> collectKinds(article.nodes) }.filter { it !in allowed }
    }

    private fun collectKinds(nodes: List<ImportNode>): List<String> =
        nodes.flatMap { node ->
            listOf(node.kind.trim().lowercase()) + collectKinds(node.children)
        }
}

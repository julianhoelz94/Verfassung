package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportNode
import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportRequest
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
        if (request.sourceUrl.isNullOrBlank() && request.gazetteReference.isNullOrBlank()) {
            errors += "MISSING_SOURCE" to "sourceUrl or gazetteReference is required"
        }
        if (request.sourceUrl != null && !request.sourceUrl.startsWith("https://")) {
            errors += "INVALID_SOURCE_URL" to "sourceUrl must use HTTPS"
        }
        if (request.articles.isEmpty() && request.roots.isEmpty()) {
            errors += "NO_ARTICLES" to "at least one article is required"
        }
        if (request.articles.isNotEmpty() && request.roots.isNotEmpty()) errors += "MIXED_FORMATS" to "Use roots or articles, not both"
        if (request.roots.isNotEmpty()) {
            val kinds = (pinnedOutline ?: request.outline)?.kinds.orEmpty()
            val rootKinds = kinds.filter { it.root == true }.map { it.kindCode }.toSet()
                .ifEmpty { setOf(kinds.firstOrNull()?.kindCode ?: "article") }
            if (request.roots.any { it.kind !in rootKinds }) errors += "ROOT_KIND" to "Roots must use one of ${rootKinds.joinToString()}"
            val allowed = allowedKinds(request, pinnedOutline)
            val byCode = kinds.associateBy { it.kindCode }
            fun children(kind: String): List<String> = byCode[kind]?.let { level ->
                level.allowedChildKinds ?: kinds.getOrNull(kinds.indexOf(level) + 1)?.let { listOf(it.kindCode) }.orEmpty()
            }.orEmpty()
            val logicalIds = mutableSetOf<java.util.UUID>()
            fun visit(node: com.constitutionatlas.platform.OrderedNodeWrite, parent: String?, path: String) {
                val kind = node.kind?.trim()?.lowercase().orEmpty()
                if (kind !in allowed) errors += "UNKNOWN_KIND" to "$path: kind '$kind' is not in the outline"
                if (parent != null && kind !in children(parent)) errors += "HIERARCHY_KIND" to "$path: '$kind' is not allowed under '$parent'"
                if (byCode[kind]?.allowTextAlongsideChildren == false && children(kind).isNotEmpty() && node.content.orEmpty().any { it.type == "text" }) {
                    errors += "TEXT_ALONGSIDE_CHILDREN" to "$path: text is not allowed in '$kind'"
                }
                if (node.revisionId != null || ((node.predecessorRevisionId != null || node.lineage.isNotEmpty()) && request.predecessorVersionId == null)) errors += "REVISION_REFERENCE" to "$path: ancestry requires a pinned predecessor version; stored revision reuse is not supported"
                if (node.logicalId != null && !logicalIds.add(requireNotNull(node.logicalId))) errors += "DUPLICATE_LOGICAL_ID" to "Logical identities must be unique"
                node.content.orEmpty().forEachIndexed { index, entry ->
                    val entryPath = "$path.content[$index]"
                    entry.node?.let { visit(it, kind, "$path.content[$index].node") }
                    if (entry.logicalId != null && !logicalIds.add(requireNotNull(entry.logicalId))) errors += "DUPLICATE_LOGICAL_ID" to "Logical identities must be unique"
                    if (entry.revisionId != null || ((entry.predecessorRevisionId != null || entry.lineage.isNotEmpty()) && request.predecessorVersionId == null)) errors += "REVISION_REFERENCE" to "$entryPath: ancestry requires a pinned predecessor version; stored revision reuse is not supported"
                    if (entry.type == "text") {
                        val format = entry.format ?: "plain"
                        if (format !in setOf("plain", "table", "footnote") || (format == "table") != (entry.table != null)) errors += "RICH_FORMAT" to "$entryPath: format and table payload must agree"
                        if (format == "footnote" && entry.text.isNullOrBlank()) errors += "FOOTNOTE_BODY" to "$entryPath: footnote body is required"
                        entry.table?.let { table ->
                            if (table.rows.isEmpty() || table.rows.any { it.cells.isEmpty() }) errors += "TABLE_SHAPE" to "$entryPath: table rows need cells"
                            val headers = table.rows.flatMap { it.cells }.filter { it.header }.map { it.logicalId }.toSet()
                            table.rows.forEachIndexed { rowIndex, row ->
                                row.cells.forEachIndexed { cellIndex, cell ->
                                    if (cell.rowSpan !in 1..100 || cell.colSpan !in 1..100 || cell.headers.any { it !in headers }) errors += "TABLE_CELL" to "$entryPath.table.rows[$rowIndex].cells[$cellIndex]: invalid span or header target"
                                }
                            }
                        }
                        var previousEnd = 0
                        entry.references.sortedBy { it.start }.forEachIndexed { refIndex, ref ->
                            if (format != "plain" || ref.start < previousEnd || ref.start >= ref.end || ref.end > (entry.text?.length ?: 0)) errors += "INLINE_REFERENCE" to "$entryPath.references[$refIndex]: invalid or overlapping span"
                            previousEnd = ref.end
                        }
                    }
                }
            }
            request.roots.forEachIndexed { index, root -> visit(root, null, "roots[$index]") }
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
        val kinds = (pinnedOutline ?: request.outline)?.kinds.orEmpty()
        if (kinds.isNotEmpty() && request.articles.isNotEmpty()) {
            val roots = kinds.filter { it.root == true }.map { it.kindCode }.toSet().ifEmpty { setOf(kinds.first().kindCode) }
            if ("article" !in roots) errors += "ROOT_KIND" to "Article format requires an article root; use roots for this outline"
            val byCode = kinds.associateBy { it.kindCode }
            fun visitArticleNode(node: ImportNode, parent: String, path: String) {
                val expected = byCode[parent]?.let { it.allowedChildKinds ?: kinds.getOrNull(kinds.indexOf(it) + 1)?.let { next -> listOf(next.kindCode) }.orEmpty() }.orEmpty()
                if (node.kind.trim().lowercase() !in expected) errors += "HIERARCHY_KIND" to "$path: '${node.kind}' is not allowed under '$parent'"
                node.children.forEachIndexed { index, child -> visitArticleNode(child, node.kind, "$path.children[$index]") }
            }
            request.articles.forEachIndexed { articleIndex, article -> article.nodes.forEachIndexed { index, node -> visitArticleNode(node, "article", "articles[$articleIndex].nodes[$index]") } }
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

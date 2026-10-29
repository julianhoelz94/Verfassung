package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportNode

/** Compatibility checks for legacy articles, preserving projection text and diagnostic ordering. */
internal object LegacyImportValidation {
    /** Legacy diagnostics precede sentence-policy checks and the final hierarchy walk. */
    fun errors(articles: List<ImportArticle>, outline: ImportOutlineValidation): List<Pair<String, String>> = buildList {
        if (articles.any(::mixedArticle)) {
            add("MIXED_LEGACY_CONTENT" to "Use ordered roots to preserve distinct text alongside child units; legacy body may only repeat the child projection")
        }
        addAll(numberingErrors(articles))
        articles.flatMap { collectKinds(it.nodes) }.filter { it !in outline.allowedKinds }.distinct().forEach { kind ->
            add("UNKNOWN_KIND" to "kind '$kind' is not in the outline")
        }
        addAll(outline.sentenceErrors())
        if (outline.configured && articles.isNotEmpty()) addAll(hierarchyErrors(articles, outline))
    }

    /** Article numbers ignore surrounding whitespace; sort order must be exactly 1 through article count. */
    private fun numberingErrors(articles: List<ImportArticle>): List<Pair<String, String>> = buildList {
        val numbers = articles.map { it.articleNumber.trim() }
        if (numbers.any { it.isBlank() }) add("BLANK_NUMBER" to "articleNumber must not be blank")
        if (numbers.filter { it.isNotBlank() }.let { it.size != it.toSet().size }) add("DUPLICATE_NUMBER" to "article numbers must be unique")
        val orders = articles.map { it.sortOrder }
        if (orders.toSet().size != orders.size) add("DUPLICATE_ORDER" to "sortOrder values must be unique")
        if (orders.any { it < 1 }) add("INVALID_ORDER" to "sortOrder must be >= 1")
        if (articles.isNotEmpty() && orders.toSet() != (1..articles.size).toSet()) {
            add("ORDER_GAPS" to "sortOrder must be a contiguous sequence starting at 1")
        }
    }

    /** An aggregate body is compatible only if it exactly repeats its descendants' single-space projection. */
    private fun mixedArticle(article: ImportArticle): Boolean =
        (article.body.isNotEmpty() && article.nodes.isNotEmpty() && article.body != article.nodes.joinToString(" ", transform = ::legacyText)) || article.nodes.any(::mixedNode)

    /** Nested bodies follow the same exact-text rule; no whitespace normalization is permitted. */
    private fun mixedNode(node: ImportNode): Boolean =
        (!node.body.isNullOrEmpty() && node.children.isNotEmpty() && node.body != node.children.joinToString(" ", transform = ::legacyText)) || node.children.any(::mixedNode)

    /** Nonleaf text comes exclusively from descendant bodies, including empty leaf bodies. */
    private fun legacyText(node: ImportNode): String = if (node.children.isEmpty()) node.body.orEmpty() else node.children.joinToString(" ", transform = ::legacyText)

    /** Unknown-kind feedback is normalized and deduplicated in first-seen traversal order. */
    private fun collectKinds(nodes: List<ImportNode>): List<String> = nodes.flatMap { node -> listOf(node.kind.trim().lowercase()) + collectKinds(node.children) }

    /** Legacy input always has an implicit article root; explicit outlines may disallow that format. */
    private fun hierarchyErrors(articles: List<ImportArticle>, outline: ImportOutlineValidation): List<Pair<String, String>> = buildList {
        if ("article" !in outline.rootKinds) add("ROOT_KIND" to "Article format requires an article root; use roots for this outline")
        articles.forEachIndexed { articleIndex, article ->
            article.nodes.forEachIndexed { index, node -> addAll(nodeErrors(node, "article", "articles[$articleIndex].nodes[$index]", outline)) }
        }
    }

    /** Normalize a child's membership test but retain its raw kind as the next parent and in messages. */
    private fun nodeErrors(node: ImportNode, parent: String, path: String, outline: ImportOutlineValidation): List<Pair<String, String>> = buildList {
        if (node.kind.trim().lowercase() !in outline.children(parent)) add("HIERARCHY_KIND" to "$path: '${node.kind}' is not allowed under '$parent'")
        node.children.forEachIndexed { index, child -> addAll(nodeErrors(child, node.kind, "$path.children[$index]", outline)) }
    }
}

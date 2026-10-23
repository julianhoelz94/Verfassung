package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportArticle
import com.constitutionatlas.ingestion.api.ImportNode
import com.constitutionatlas.platform.OrderedEntryWrite
import com.constitutionatlas.platform.OrderedNodeWrite

/** The legacy endpoint treats non-leaf body values as redundant child projections. */
internal fun legacyImportRoots(articles: List<ImportArticle>): List<OrderedNodeWrite> {
    fun node(value: ImportNode): OrderedNodeWrite = OrderedNodeWrite(
        kind = value.kind,
        label = value.label,
        title = value.title,
        content = (if (value.children.isEmpty()) listOfNotNull(value.body?.let { OrderedEntryWrite("text", text = it) }) else emptyList()) + value.children.map { OrderedEntryWrite("child", node = node(it)) },
    )
    return articles.sortedBy { it.sortOrder }.map { article ->
        OrderedNodeWrite(
            kind = "article",
            label = article.articleNumber,
            title = article.title,
            content = (if (article.nodes.isEmpty()) listOf(OrderedEntryWrite("text", text = article.body)) else emptyList()) + article.nodes.map { OrderedEntryWrite("child", node = node(it)) },
        )
    }
}

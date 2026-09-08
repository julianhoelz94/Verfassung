package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.client.ContentTreeArticle
import com.constitutionatlas.amendment.client.ContentTreeNode
import java.util.UUID

internal data class FlatNode(
    val id: UUID,
    val kind: String,
    val label: String?,
    val number: String?,
    val title: String?,
    val body: String?,
    val predecessorId: UUID?,
    val articleId: UUID,
    val articleNumber: String,
)

internal data class NodeChange(
    val type: String,
    val node: FlatNode,
)

internal object AmendmentDiff {
    fun flatten(articles: List<ContentTreeArticle>): List<FlatNode> =
        articles.flatMap { article ->
            val root =
                FlatNode(
                    id = article.id,
                    kind = "article",
                    label = article.articleNumber,
                    number = article.articleNumber,
                    title = article.title,
                    body = article.body,
                    predecessorId = article.predecessorId,
                    articleId = article.id,
                    articleNumber = article.articleNumber,
                )
            listOf(root) + flattenChildren(article.children, article.id, article.articleNumber)
        }

    fun diff(source: List<FlatNode>, target: List<FlatNode>): List<NodeChange> {
        val sourceById = source.associateBy { it.id }
        val unmatchedSource = source.map { it.id }.toMutableSet()
        val unmatchedTarget = mutableListOf<FlatNode>()
        val pairs = mutableListOf<Pair<FlatNode, FlatNode>>()

        for (node in target) {
            val predecessor = node.predecessorId
            if (predecessor != null && predecessor in unmatchedSource && predecessor in sourceById) {
                pairs += sourceById.getValue(predecessor) to node
                unmatchedSource.remove(predecessor)
            } else {
                unmatchedTarget += node
            }
        }

        val stillUnmatched = mutableListOf<FlatNode>()
        for (node in unmatchedTarget) {
            val key = identityKey(node)
            val match =
                source.firstOrNull { candidate ->
                    candidate.id in unmatchedSource && identityKey(candidate) == key
                }
            if (match != null) {
                pairs += match to node
                unmatchedSource.remove(match.id)
            } else {
                stillUnmatched += node
            }
        }

        val added = stillUnmatched.map { NodeChange("added", it) }
        val removed = source.filter { it.id in unmatchedSource }.map { NodeChange("removed", it) }
        val changed =
            pairs
                .filter { (from, to) -> textOf(from) != textOf(to) }
                .map { (_, to) -> NodeChange("changed", to) }
        return added + changed + removed
    }

    private fun flattenChildren(
        nodes: List<ContentTreeNode>,
        articleId: UUID,
        articleNumber: String,
    ): List<FlatNode> =
        nodes.flatMap { node ->
            val flat =
                FlatNode(
                    id = node.id,
                    kind = node.kind,
                    label = node.label,
                    number = node.number,
                    title = node.title,
                    body = node.body,
                    predecessorId = node.predecessorId,
                    articleId = articleId,
                    articleNumber = articleNumber,
                )
            listOf(flat) + flattenChildren(node.children, articleId, articleNumber)
        }

    private fun identityKey(node: FlatNode): String =
        "${node.kind}\u0000${(node.number ?: node.label ?: "").lowercase()}"

    private fun textOf(node: FlatNode): String =
        "${node.title.orEmpty()}\u0000${node.body.orEmpty()}"
}

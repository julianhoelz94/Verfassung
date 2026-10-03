package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.client.ContentTreeArticle
import com.constitutionatlas.amendment.client.ContentTreeNode
import com.constitutionatlas.platform.DiffEntry
import com.constitutionatlas.platform.DiffNode
import com.constitutionatlas.platform.DiffRun
import com.constitutionatlas.platform.HierarchicalDiff
import com.constitutionatlas.platform.OrderedContentText
import com.constitutionatlas.platform.OrderedEntry
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
    val logicalId: UUID? = null,
    val revisionId: UUID? = null,
    val legacyIdentity: Boolean = false,
    val legacyPath: String? = null,
)

internal data class NodeChange(
    val type: String,
    val node: FlatNode,
    val before: FlatNode? = null,
    val ambiguous: Boolean = false,
)

internal object AmendmentDiff {
    fun hierarchical(sourceVersionId: UUID, source: List<ContentTreeArticle>, targetVersionId: UUID, target: List<ContentTreeArticle>, sourceSettingsRevisionId: UUID? = null, targetSettingsRevisionId: UUID? = null): DiffRun =
        HierarchicalDiff.compare(sourceVersionId, source.map(::asDiffNode), targetVersionId, target.map(::asDiffNode), sourceSettingsRevisionId, targetSettingsRevisionId)

    private fun asDiffNode(article: ContentTreeArticle): DiffNode = DiffNode(
        logicalId = article.logicalId ?: article.id,
        revisionId = article.revisionId,
        occurrenceId = article.id,
        kind = article.kind,
        label = article.articleNumber,
        title = article.title,
        entries = article.content?.map(::asDiffEntry)
            ?: listOfNotNull(article.body?.let { DiffEntry.Text(UUID.nameUUIDFromBytes("body:${article.logicalId ?: article.predecessorId ?: article.id}".toByteArray()), null, null, it) }) + article.children.map { DiffEntry.Child(asDiffNode(it)) },
        predecessorId = article.predecessorId,
        lineage = article.lineage,
    )

    private fun asDiffNode(node: ContentTreeNode): DiffNode = DiffNode(
        logicalId = node.logicalId ?: node.id,
        revisionId = node.revisionId,
        occurrenceId = node.id,
        kind = node.kind,
        label = node.label ?: node.number,
        title = node.title,
        entries = node.content?.map(::asDiffEntry)
            ?: listOfNotNull(node.body?.let { DiffEntry.Text(UUID.nameUUIDFromBytes("body:${node.logicalId ?: node.predecessorId ?: node.id}".toByteArray()), null, null, it) }) + node.children.map { DiffEntry.Child(asDiffNode(it)) },
        predecessorId = node.predecessorId,
        lineage = node.lineage,
    )

    private fun asDiffEntry(entry: OrderedEntry): DiffEntry = when (entry.type) {
        "child" -> {
            val node = requireNotNull(entry.node)
            DiffEntry.Child(DiffNode(node.logicalId, node.revisionId, node.occurrenceId, node.kind, node.label, node.title, node.content.map(::asDiffEntry), lineage = node.lineage))
        }
        "text" -> DiffEntry.Text(entry.logicalId ?: requireNotNull(entry.occurrenceId), entry.revisionId, entry.occurrenceId, requireNotNull(entry.text), entry.lineage)
        else -> throw IllegalArgumentException("Unknown ordered entry type '${entry.type}'")
    }

    fun flatten(articles: List<ContentTreeArticle>): List<FlatNode> =
        articles.flatMap { article ->
            val root =
                FlatNode(
                    id = article.id,
                    kind = article.kind,
                    label = article.articleNumber,
                    number = article.articleNumber,
                    title = article.title,
                    body = article.content?.let(OrderedContentText::entries) ?: article.body,
                    logicalId = article.logicalId, revisionId = article.revisionId, legacyIdentity = article.legacyIdentity,
                    predecessorId = article.predecessorId,
                    articleId = article.id,
                    articleNumber = article.articleNumber,
                )
            listOf(root) + (article.content?.let { flattenOrdered(it, article.id, article.articleNumber, article.legacyIdentity, article.articleNumber) } ?: flattenChildren(article.children, article.id, article.articleNumber))
        }

    fun diff(source: List<FlatNode>, target: List<FlatNode>): List<NodeChange> {
        val sourceById = source.associateBy { it.id }
        val unmatchedSource = source.map { it.id }.toMutableSet()
        val unmatchedTarget = mutableListOf<FlatNode>()
        val ambiguousTargetIds = mutableSetOf<UUID>()
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
            val matches = source.filter { candidate ->
                candidate.id in unmatchedSource && (if (node.logicalId != null) candidate.logicalId == node.logicalId else candidate.logicalId == null && identityKey(candidate) == key)
            }
            val match = matches.singleOrNull()
            if (match != null) {
                pairs += match to node
                unmatchedSource.remove(match.id)
            } else {
                if (matches.size > 1) ambiguousTargetIds += node.id
                stillUnmatched += node
            }
        }

        val addedTargets = mutableListOf<FlatNode>()
        for (node in stillUnmatched) {
            val match = source.firstOrNull { candidate ->
                candidate.id in unmatchedSource && node.legacyIdentity && candidate.legacyIdentity && legacyKey(candidate) == legacyKey(node)
            }
            if (match != null) {
                pairs += match to node
                unmatchedSource.remove(match.id)
            } else {
                addedTargets += node
            }
        }
        val added = addedTargets.map { NodeChange("added", it, ambiguous = it.id in ambiguousTargetIds) }
        val removed = source.filter { it.id in unmatchedSource }.map { NodeChange("removed", it) }
        val changed =
            pairs
                .filter { (from, to) ->
                    if (from.logicalId != null && from.logicalId == to.logicalId && from.revisionId != null && from.revisionId == to.revisionId) {
                        false
                    } else if (from.logicalId != null && from.logicalId == to.logicalId && from.revisionId != null && to.revisionId != null) {
                        true
                    } else {
                        textOf(from) != textOf(to)
                    }
                }
                .map { (from, to) -> NodeChange("changed", to, before = from) }
        return added + changed + removed
    }

    private fun flattenOrdered(entries: List<com.constitutionatlas.platform.OrderedEntry>, articleId: UUID, articleNumber: String, legacyIdentity: Boolean, path: String): List<FlatNode> = entries.flatMapIndexed { index, entry ->
        val node = entry.node
        if (node != null) {
            listOf(FlatNode(node.occurrenceId, node.kind, node.label, node.label, node.title, OrderedContentText.entries(node.content), null, articleId, articleNumber, node.logicalId, node.revisionId, legacyIdentity, "$path/${node.kind}:${node.label.orEmpty()}:$index")) + flattenOrdered(node.content, articleId, articleNumber, legacyIdentity, "$path/${node.kind}:${node.label.orEmpty()}:$index")
        } else {
            listOf(FlatNode(requireNotNull(entry.occurrenceId), "parent_text", null, null, null, requireNotNull(entry.text), null, articleId, articleNumber, entry.logicalId, entry.revisionId, legacyIdentity, "$path/text:$index"))
        }
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
                    body = node.content?.let(OrderedContentText::entries) ?: node.body,
                    logicalId = node.logicalId, revisionId = node.revisionId,
                    predecessorId = node.predecessorId,
                    articleId = articleId,
                    articleNumber = articleNumber,
                )
            listOf(flat) + flattenChildren(node.children, articleId, articleNumber)
        }

    private fun legacyKey(node: FlatNode): String = "${node.articleNumber}\u0000${node.legacyPath ?: identityKey(node)}"

    private fun identityKey(node: FlatNode): String =
        "${node.kind}\u0000${(node.number ?: node.label ?: "").lowercase()}"

    private fun textOf(node: FlatNode): String =
        "${node.title.orEmpty()}\u0000${node.body.orEmpty()}"
}

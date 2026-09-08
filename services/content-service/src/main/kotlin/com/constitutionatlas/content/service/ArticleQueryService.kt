package com.constitutionatlas.content.service

import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.content.api.ArticleDetail
import com.constitutionatlas.content.api.ArticleSummary
import com.constitutionatlas.content.api.ArticleWrite
import com.constitutionatlas.content.api.ContentNodeDto
import com.constitutionatlas.content.api.NodeWrite
import com.constitutionatlas.content.client.PublicationGuard
import com.constitutionatlas.content.repo.ArticleRepository
import com.constitutionatlas.content.repo.ContentNodeInsert
import com.constitutionatlas.content.repo.ContentNodeRecord
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class ArticleQueryService(
    private val articleRepository: ArticleRepository,
    private val publicationGuard: PublicationGuard,
) {
    fun listByVersion(
        versionId: UUID,
        offset: Int = 0,
        limit: Int? = null,
        includeBody: Boolean = false,
    ): List<ArticleSummary> {
        val items = articleRepository.listByVersion(versionId, offset, limit, includeBody)
        if (!includeBody) {
            return items
        }
        return items.map { attachChildren(it) }
    }

    fun countByVersion(versionId: UUID): Int = articleRepository.countByVersion(versionId)

    fun getById(id: UUID): ArticleDetail {
        val article = articleRepository.findById(id) ?: throw NotFoundException("Unknown article '$id'")
        return attachChildren(article)
    }

    @Transactional
    fun replaceForVersion(versionId: UUID, articles: List<ArticleWrite>): List<ArticleSummary> {
        publicationGuard.requireWritable(versionId)
        val numbers = articles.map { it.articleNumber.trim() }
        if (numbers.toSet().size != numbers.size) {
            throw IllegalArgumentException("articleNumber values must be unique")
        }
        val orders = articles.map { it.sortOrder }
        if (orders.toSet().size != orders.size) {
            throw IllegalArgumentException("sortOrder values must be unique")
        }
        val assigned = assignedIds(articles)
        if (assigned.size != assigned.toSet().size) {
            throw IllegalArgumentException("node id values must be unique")
        }
        articleRepository.deleteForVersion(versionId)
        articles.forEach { article ->
            val id = article.id ?: UUID.randomUUID()
            val hasNodes = article.nodes.isNotEmpty()
            articleRepository.insertNode(
                ContentNodeInsert(
                    id = id,
                    versionId = versionId,
                    kind = "article",
                    parentId = null,
                    label = article.articleNumber,
                    number = article.articleNumber,
                    title = article.title,
                    body = if (hasNodes) null else article.body,
                    sortOrder = article.sortOrder,
                    predecessorId = article.predecessorId,
                ),
            )
            article.nodes.forEachIndexed { index, node ->
                insertWriteNode(versionId, id, node, index + 1)
            }
        }
        return listByVersion(versionId)
    }

    @Transactional
    fun updateText(id: UUID, title: String, body: String): ArticleDetail {
        if (title.isBlank()) {
            throw IllegalArgumentException("title must not be blank")
        }
        val current = articleRepository.findById(id) ?: throw NotFoundException("Unknown article '$id'")
        publicationGuard.requireWritable(current.versionId)
        val children = articleRepository.listChildren(id)
        val flattened = projectedBody(null, children).orEmpty()
        val keepTree = children.isNotEmpty() && body.trim() == flattened.trim()
        if (keepTree) {
            if (!articleRepository.updateRoot(id, title, body = null)) {
                throw NotFoundException("Unknown article '$id'")
            }
        } else {
            articleRepository.deleteChildren(id)
            if (!articleRepository.updateRoot(id, title, body)) {
                throw NotFoundException("Unknown article '$id'")
            }
        }
        return getById(id)
    }

    @Transactional
    fun updateNodeTitle(id: UUID, title: String?): ContentNodeDto {
        if (!articleRepository.nodeExists(id)) {
            throw NotFoundException("Unknown node '$id'")
        }
        val versionId = articleRepository.versionIdOfNode(id)
            ?: throw NotFoundException("Unknown node '$id'")
        publicationGuard.requireWritable(versionId)
        val parentId = articleRepository.parentIdOf(id)
        val stored = title?.trim()?.takeIf { it.isNotEmpty() }
        if (parentId == null) {
            val required = stored ?: throw IllegalArgumentException("title must not be blank")
            articleRepository.updateNodeTitle(id, required)
        } else {
            articleRepository.updateNodeTitle(id, stored)
        }
        return articleRepository.findNode(id) ?: throw NotFoundException("Unknown node '$id'")
    }

    @Transactional
    fun restructure(versionId: UUID, keepKinds: List<String>): Int {
        val kinds = keepKinds.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (kinds.isEmpty()) {
            throw IllegalArgumentException("keepKinds must not be empty")
        }
        publicationGuard.requireWritable(versionId)
        var absorbed = 0
        while (true) {
            val removed = articleRepository.listNodesOutsideKinds(versionId, kinds)
            if (removed.isEmpty()) {
                break
            }
            absorb(nextVictim(removed, nodeDepths(versionId)), kinds.first())
            absorbed += 1
        }
        return absorbed
    }

    private fun insertWriteNode(versionId: UUID, parentId: UUID, node: NodeWrite, sortOrder: Int) {
        val id = node.id ?: UUID.randomUUID()
        articleRepository.insertNode(
            ContentNodeInsert(
                id = id,
                versionId = versionId,
                kind = node.kind,
                parentId = parentId,
                label = node.label,
                number = node.label,
                title = node.title,
                body = if (node.children.isNotEmpty()) null else node.body,
                sortOrder = sortOrder,
                predecessorId = node.predecessorId,
            ),
        )
        node.children.forEachIndexed { index, child ->
            insertWriteNode(versionId, id, child, index + 1)
        }
    }

    private fun assignedIds(articles: List<ArticleWrite>): List<UUID> {
        val ids = mutableListOf<UUID>()
        fun walk(node: NodeWrite) {
            node.id?.let { ids += it }
            node.children.forEach(::walk)
        }
        articles.forEach { article ->
            article.id?.let { ids += it }
            article.nodes.forEach(::walk)
        }
        return ids
    }

    private fun nextVictim(removed: List<ContentNodeRecord>, depths: Map<UUID, Int>): ContentNodeRecord {
        val maxDepth = removed.maxOf { depths[it.id] ?: 0 }
        return removed
            .filter { (depths[it.id] ?: 0) == maxDepth }
            .sortedWith(compareBy<ContentNodeRecord> { it.sortOrder }.thenBy { it.id.toString() })
            .first()
    }

    private fun nodeDepths(versionId: UUID): Map<UUID, Int> {
        val parents = articleRepository.parentMap(versionId)
        val memo = mutableMapOf<UUID, Int>()
        fun depth(id: UUID): Int {
            memo[id]?.let { return it }
            val parent = parents[id] ?: return 0.also { memo[id] = 0 }
            val value = depth(parent) + 1
            memo[id] = value
            return value
        }
        parents.keys.forEach { depth(it) }
        return memo
    }

    private fun absorb(node: ContentNodeRecord, fallbackRootKind: String) {
        val parentId = node.parentId
        if (parentId == null) {
            articleRepository.updateKind(node.id, fallbackRootKind)
            return
        }
        val extra = node.body?.trim().orEmpty()
        if (extra.isNotEmpty()) {
            val parentBody = articleRepository.bodyOf(parentId)
            val joined = listOf(parentBody?.trim().orEmpty(), extra).filter { it.isNotEmpty() }.joinToString(" ")
            articleRepository.updateBody(parentId, joined)
        }
        articleRepository.listChildOrders(node.id).forEach { (childId, childOrder) ->
            articleRepository.reparent(childId, parentId, node.sortOrder * 1_000 + childOrder)
        }
        articleRepository.deleteNode(node.id)
    }

    private fun attachChildren(item: ArticleSummary): ArticleSummary {
        val children = articleRepository.listChildren(item.id)
        return item.copy(body = projectedBody(item.body, children), children = children)
    }

    private fun attachChildren(article: ArticleDetail): ArticleDetail {
        val children = articleRepository.listChildren(article.id)
        return article.copy(body = projectedBody(article.body, children).orEmpty(), children = children)
    }

    private fun projectedBody(stored: String?, children: List<ContentNodeDto>): String? =
        if (children.isNotEmpty()) ContentTrees.flattenText(children) else stored
}

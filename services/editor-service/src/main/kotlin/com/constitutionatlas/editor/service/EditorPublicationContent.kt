package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.DraftArticleDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.StructuredDraftPreview
import com.constitutionatlas.editor.client.ArticleWritePayload
import com.constitutionatlas.editor.client.CatalogClient
import com.constitutionatlas.editor.client.CatalogVersion
import com.constitutionatlas.editor.client.ContentClient
import com.constitutionatlas.editor.client.ContentTreeArticle
import com.constitutionatlas.editor.client.ContentTreeNode
import com.constitutionatlas.editor.client.NodeWritePayload
import com.constitutionatlas.editor.repo.SourceEvidenceRepository
import com.constitutionatlas.platform.OrderedSnapshot
import java.util.UUID

/** Source metadata and its legal identity remain distinct for editorial corrections. */
internal data class PublicationSource(val source: CatalogVersion, val legalId: UUID)

/** Draft article order is retained so legacy updates address the corresponding copied article. */
internal data class PublicationArticles(val sourceTree: List<ContentTreeArticle>, val changedArticles: List<ContentTreeArticle>)

/** Source-tip policy and copy-on-write/legacy content creation inside the caller's publication transaction. */
internal class EditorPublicationContent(private val catalogClient: CatalogClient, private val contentClient: ContentClient, private val structuredPublication: StructuredPublicationService, private val sourceEvidence: SourceEvidenceRepository) {
    /** A persisted reservation bypasses fresh tip checks, preserving idempotent retry behavior. */
    fun source(session: EditSessionDto, structured: Boolean, hopKind: String, reservation: CatalogVersion?): PublicationSource {
        val source = catalogClient.getVersion(session.versionId)
        if (structured && source.publicationStatus != "published") throw ConflictException("Structured successors require a published source", "stale_source")
        val versions = if (hopKind == "editorial_correction" && source.currentVersionId != null) {
            emptyList()
        } else {
            catalogClient.listVersions(
                source.constitutionId,
                if (hopKind == "editorial_correction") "public" else "all",
            )
        }
        val legalId = source.legalVersionId ?: source.id
        requireTips(session, hopKind, reservation, source, versions, legalId)
        return PublicationSource(source, legalId)
    }

    /** Without a reservation the source must remain both this law's editorial tip and, for legal hops, the legal tip. */
    private fun requireTips(session: EditSessionDto, hopKind: String, reservation: CatalogVersion?, source: CatalogVersion, versions: List<CatalogVersion>, legalId: UUID) {
        if (reservation == null &&
            (
                versions.any { it.editorialPredecessorVersionId == session.versionId } ||
                    (source.currentVersionId != null && source.currentVersionId != session.versionId)
                )
        ) {
            throw ConflictException("session version is not this law's editorial tip", "not_editorial_tip")
        }
        if (hopKind == "legal" && reservation == null) {
            val legalPredecessors = versions.mapNotNull { it.legalPredecessorVersionId }
                .map { predecessor -> versions.find { it.id == predecessor }?.legalVersionId ?: predecessor }.toSet()
            val legalTipIds = versions.filter { it.hopKind == "initial" || it.hopKind == "legal" }
                .map { it.legalVersionId ?: it.id }.toSet() - legalPredecessors
            if (legalTipIds.isNotEmpty() && legalId !in legalTipIds) {
                throw ConflictException("session version is not the current legal tip", "not_legal_tip")
            }
        }
    }

    /** Validates source content before selecting roots or matching legacy drafts by their persisted IDs. */
    fun articles(session: EditSessionDto, structured: Boolean, structuredPreview: StructuredDraftPreview?, drafts: List<DraftArticleDto>): PublicationArticles {
        val sourceTree = contentClient.listArticles(session.versionId)
        if (!structured && sourceTree.any { EditorPublicationRules.mixedContent(it.content) }) throw ConflictException("Ordered successor publishing is required for mixed content", "ordered_publish_required")
        if (sourceTree.isEmpty()) {
            throw ConflictException("Source version ${session.versionId} has no articles to copy")
        }
        val changedArticles = if (structuredPreview != null) {
            val changedIndexes = structuredPublication.changedSourceRootIndexes(structuredPreview)
            sourceTree.filterIndexed { index, _ -> index in changedIndexes }
        } else {
            drafts.map { draft ->
                sourceTree.find { it.id == draft.articleId } ?: throw ConflictException("Article ${draft.articleId} is not on this version")
            }
        }
        return PublicationArticles(sourceTree, changedArticles)
    }

    /** Ordered writes retain reviewed evidence and occurrence mappings; legacy writes copy then apply each draft. */
    fun write(session: EditSessionDto, structuredPreview: StructuredDraftPreview?, source: CatalogVersion, hopKind: String, comment: String?, authorization: String?, sourceTree: List<ContentTreeArticle>, changedArticles: List<ContentTreeArticle>, drafts: List<DraftArticleDto>): Pair<CatalogVersion, Map<String, String>> {
        val sessionId = session.id
        var orderedMapping: Map<String, String> = emptyMap()
        val successor = if (structuredPreview != null) {
            val reviewedSource = sourceEvidence.latest(sessionId)?.let { source.copy(sourceEvidence = it.evidence) } ?: source
            val (reserved, snapshot) = structuredPublication.write(structuredPreview, reviewedSource, hopKind, comment, authorization)
            orderedMapping = unitMapping(snapshot)
            reserved
        } else {
            val copied = createSuccessor(source, hopKind, session.versionId, comment)
            contentClient.replaceArticles(copied.id, sourceTree.map { toWrite(it) })
            val copies = contentClient.listArticles(copied.id).associateBy { it.articleNumber }
            drafts.forEachIndexed { index, draft ->
                val sourceArticle = changedArticles[index]
                val copy = copies[sourceArticle.articleNumber] ?: throw ConflictException("Copied article ${sourceArticle.articleNumber} is missing")
                contentClient.updateArticle(copy.id, draft.title, draft.body)
            }
            copied
        }
        return successor to orderedMapping
    }

    /** Maps logical units to stored occurrences in preorder, including text entries. */
    private fun unitMapping(snapshot: OrderedSnapshot): Map<String, String> {
        val mapping = linkedMapOf<String, String>()

        /** Child nodes recurse in place; non-child entries retain their own occurrence identity. */
        fun mapNode(node: com.constitutionatlas.platform.OrderedNode) {
            mapping[node.logicalId.toString()] = node.occurrenceId.toString()
            node.content.forEach { entry -> entry.node?.let(::mapNode) ?: run { mapping[entry.logicalId.toString()] = entry.occurrenceId.toString() } }
        }
        snapshot.roots.forEach(::mapNode)
        return mapping
    }

    /** Tries historical label suffixes while preserving legal/editorial tip conflicts without retry. */
    private fun createSuccessor(
        source: CatalogVersion,
        hopKind: String,
        predecessorVersionId: UUID,
        publicationComment: String?,
    ): CatalogVersion {
        for (n in 1..50) {
            val label = "${source.versionLabel}-$n"
            try {
                return catalogClient.createDraftVersion(
                    source.constitutionId,
                    label,
                    source.effectiveDate,
                    source.languageCode,
                    predecessorVersionId,
                    hopKind,
                    publicationComment,
                )
            } catch (ex: ConflictException) {
                if (ex.code == "not_legal_tip" || ex.code == "not_editorial_tip") {
                    throw ex
                }
                continue
            }
        }
        throw ConflictException("Could not allocate a successor label for '${source.versionLabel}'")
    }

    /** Allocates a fresh article identity and records its original predecessor. */
    private fun toWrite(article: ContentTreeArticle): ArticleWritePayload {
        val newId = UUID.randomUUID()
        return ArticleWritePayload(
            articleNumber = article.articleNumber,
            title = article.title,
            body = article.body.orEmpty(),
            sortOrder = article.sortOrder,
            nodes = article.children.map(::toNodeWrite),
            id = newId,
            predecessorId = article.id,
        )
    }

    /** Child nodes likewise receive fresh identities without rewriting authored text. */
    private fun toNodeWrite(node: ContentTreeNode): NodeWritePayload {
        val newId = UUID.randomUUID()
        return NodeWritePayload(
            kind = node.kind,
            label = node.label ?: node.number,
            title = node.title,
            body = node.body,
            children = node.children.map(::toNodeWrite),
            id = newId,
            predecessorId = node.id,
        )
    }
}

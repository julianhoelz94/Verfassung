package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.CreateCuratedComparison
import com.constitutionatlas.catalog.api.CuratedComparison
import com.constitutionatlas.catalog.client.ArchiveTargetClient
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.catalog.repo.CuratedComparisonRepository
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.OrderedNode
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.security.MessageDigest
import java.util.UUID

@Service
class CuratedComparisonService(private val comparisons: CuratedComparisonRepository, private val catalog: CatalogRepository, private val targets: ArchiveTargetClient, private val mapper: ObjectMapper) {
    fun get(id: UUID, staff: Boolean): CuratedComparison {
        val item = comparisons.find(id) ?: throw NotFoundException("Unknown comparison")
        if (!staff && item.state != "published") throw NotFoundException("Unknown comparison")
        return item.copy(needsReview = item.definition.columns.any { column -> catalog.findVersion(column.versionId)?.currentVersionId?.let { it != column.versionId } == true })
    }
    fun list(staff: Boolean) = comparisons.list(staff).map { id ->
        val item = get(id, staff)
        mapOf("id" to id, "title" to item.definition.title, "state" to item.state, "needsReview" to item.needsReview)
    }

    @Transactional
    fun create(request: CreateCuratedComparison, actor: UUID, authorization: String?): CuratedComparison {
        require(request.title.length in 1..512 && request.attribution.length in 1..10000 && request.sourceUrl.startsWith("https://") && request.sourceUrl.length <= 2048) { "Comparison requires title, attribution and HTTPS provenance" }
        require(request.columns.size in 2..8 && request.columns.map { it.constitutionId }.distinct().size == request.columns.size) { "Comparison columns must identify 2 to 8 distinct constitutions" }
        require(request.topics.size in 1..500 && mapper.writeValueAsBytes(request).size <= 512 * 1024) { "Comparison exceeds 500 topics or 512 KiB" }
        require(request.sourceDocumentRevision > 0) { "An exact captured source revision is required" }
        val source = targets.document(request.sourceDocumentId, request.sourceDocumentRevision, authorization)
        require(source.path("revision").path("fileName").isTextual && source.path("revision").path("revision").asInt(0) == request.sourceDocumentRevision) { "Comparison source must preserve captured original bytes at the selected revision" }
        val identities = request.columns.map { column ->
            require(column.label.length in 1..512) { "Column label is required" }
            val version = catalog.findVersion(column.versionId) ?: throw NotFoundException("Comparison version is missing")
            require(version.constitutionId == column.constitutionId && version.publicationStatus == "published") { "Comparison columns require exact published snapshots of the selected constitution" }
            val snapshot = targets.snapshot(column.versionId, authorization)
            require(snapshot.versionId == column.versionId) { "Content snapshot pin differs" }
            val ids = mutableSetOf<UUID>()
            fun collect(node: OrderedNode) {
                ids += node.logicalId
                node.content.forEach { entry ->
                    entry.logicalId?.let(ids::add)
                    entry.node?.let(::collect)
                }
            }
            snapshot.roots.forEach(::collect)
            ids
        }
        request.topics.forEach { topic ->
            require(topic.title.length in 1..512 && topic.passages.size <= 100 && topic.passages.distinct().size == topic.passages.size) { "Invalid topic correspondence" }
            require(topic.missingColumns.distinct().size == topic.missingColumns.size && topic.missingColumns.all { it in request.columns.indices }) { "Invalid missing-counterpart columns" }
            topic.passages.forEach { passage -> require(passage.column in request.columns.indices && passage.logicalId in identities[passage.column]) { "Topic passage does not exist in its exact column snapshot" } }
            require(request.columns.indices.all { column -> (topic.passages.any { it.column == column }) != (column in topic.missingColumns) }) { "Each column needs passages or an explicit missing counterpart" }
        }
        val hash = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(request)).joinToString("") { "%02x".format(it) }
        comparisons.lock(request.attemptId)
        val previous = comparisons.attempt(request.attemptId)
        val id = if (previous == null) {
            comparisons.create(actor, request, hash)
        } else {
            if (previous.second != hash) throw ConflictException("Comparison attempt contains different correspondences", "comparison_attempt_changed")
            previous.first
        }
        return get(id, true)
    }

    fun review(id: UUID, actor: UUID, reason: String): CuratedComparison {
        require(reason.trim().length in 10..2000) { "Review reason requires 10 to 2000 characters" }
        if (!comparisons.review(id, actor, reason.trim())) throw ConflictException("Comparison is not awaiting review", "comparison_not_reviewable")
        return get(id, true)
    }
    fun publish(id: UUID, actor: UUID): CuratedComparison {
        val current = get(id, true)
        if (current.state == "published") return current
        // Public visibility is checked without staff credentials; a private capture must
        // first receive a separately authorized public link at its pinned revision.
        targets.document(current.definition.sourceDocumentId, current.definition.sourceDocumentRevision, null)
        if (!comparisons.publish(id, actor)) throw ConflictException("Comparison requires review before publication", "comparison_not_reviewed")
        return get(id, true)
    }
}

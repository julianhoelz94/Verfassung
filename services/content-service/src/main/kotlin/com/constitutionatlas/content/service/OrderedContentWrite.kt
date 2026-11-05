package com.constitutionatlas.content.service

import com.constitutionatlas.content.CatalogUnavailableException
import com.constitutionatlas.content.VersionPublishedException
import com.constitutionatlas.content.api.OrderedNode
import com.constitutionatlas.content.api.OrderedSnapshot
import com.constitutionatlas.content.api.OrderedSnapshotWrite
import com.constitutionatlas.content.client.CatalogClient
import com.constitutionatlas.content.client.StructuralSettings
import com.constitutionatlas.content.repo.OrderedContentRepository
import com.constitutionatlas.content.repo.OrderedPublishReceiptRepository
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.OrderedWriteFingerprint
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

/** Synchronous write phases remain inside OrderedContentService.save's existing transaction. */
internal class OrderedContentWrite(
    private val receipts: OrderedPublishReceiptRepository,
    private val repository: OrderedContentRepository,
    private val catalog: CatalogClient,
    private val mixedWritesEnabled: Boolean,
    private val getSnapshot: (UUID) -> OrderedSnapshot,
    private val validate: (List<OrderedNode>, StructuralSettings) -> Unit,
) {
    /** Receipt retries precede Catalog checks; all resolved roots validate before binding or replacement. */
    fun save(version: UUID, request: OrderedSnapshotWrite): OrderedSnapshot {
        val requestHash = OrderedWriteFingerprint.current(request)
        val acceptedHashes = OrderedWriteFingerprint.accepted(request)
        initialReceipt(version, request, acceptedHashes)?.let { return it }
        requireUnsealed(version)
        val metadata = catalog.getVersion(version) ?: throw NotFoundException("Unknown version '$version'")
        if (metadata.publicationStatus == "published") throw VersionPublishedException()
        val constitution = metadata.constitutionId ?: throw CatalogUnavailableException("Catalog did not supply constitution identity")
        val settings = catalog.getSettings(version) ?: throw CatalogUnavailableException("Version-pinned settings unavailable")
        val current = getSnapshot(version)
        currentReceipt(version, request, acceptedHashes, current)?.let { return it }
        requireUnsealed(version)
        if (repository.lock(version) != request.expectedGeneration) stale("Target roots changed")
        requireUnsealed(version)
        val source = source(request, constitution)
        val writer = OrderedRevisionWriter(repository, version, current, source)
        val roots = request.roots.map { writer.store(it, 0) }
        val resolved = roots.map { repository.resolveNode(version, it, emptySet()) }
        validate(resolved, settings)
        if (!mixedWritesEnabled && resolved.any(::mixed)) throw ResponseStatusException(HttpStatus.CONFLICT, "Mixed snapshot writes await ordered reader and consumer rollout")
        repository.bind(version, constitution, settings.id)
        repository.replaceRoots(version, roots, source = source)
        val saved = repository.snapshot(version)
        request.publishAttemptId?.let { receipts.insert(it, version, requestHash, saved.generation) }
        return saved
    }

    /** The earliest matching receipt bypasses publication state but rechecks sealed generation and rich invariants. */
    private fun initialReceipt(version: UUID, request: OrderedSnapshotWrite, acceptedHashes: Set<String>): OrderedSnapshot? {
        val attempt = request.publishAttemptId ?: return null
        val receipt = receipts.find(attempt) ?: return null
        if (receipt.versionId != version || receipt.requestHash !in acceptedHashes) stale("Publish attempt payload changed")
        val snapshot = getSnapshot(version)
        if (snapshot.generation != receipt.generation) stale("Reserved roots changed")
        OrderedContentRules.requireValid(OrderedContentRules.contentErrors(snapshot.roots))
        return snapshot
    }

    /** Refreshing the target can reveal a completed concurrent publication attempt before taking its lock. */
    private fun currentReceipt(version: UUID, request: OrderedSnapshotWrite, acceptedHashes: Set<String>, current: OrderedSnapshot): OrderedSnapshot? {
        val attempt = request.publishAttemptId ?: return null
        val receipt = receipts.find(attempt) ?: return null
        if (receipt.versionId != version || receipt.requestHash !in acceptedHashes || receipt.generation != current.generation) stale("Publish attempt payload or roots changed")
        OrderedContentRules.requireValid(OrderedContentRules.contentErrors(current.roots))
        return current
    }

    /** Source publication and constitution checks precede its snapshot/generation pin check. */
    private fun source(request: OrderedSnapshotWrite, constitution: UUID): OrderedSnapshot? = request.sourceVersionId?.let { sourceVersion ->
        val metadata = catalog.getVersion(sourceVersion) ?: throw NotFoundException("Unknown source version")
        if (request.publishAttemptId != null && metadata.publicationStatus != "published") stale("Successor source must be published")
        require(metadata.constitutionId == constitution) { "Cross-constitution source reference" }
        val resolved = getSnapshot(sourceVersion)
        if (request.sourceGeneration != resolved.generation) stale("Source roots changed")
        resolved
    }

    /** Repeated checks around snapshot loading and locking retain sealing/error precedence. */
    private fun requireUnsealed(version: UUID) {
        if (receipts.forVersion(version) != null) stale("Successor roots are sealed for publication")
    }

    /** A mixed subtree contains both parent text and child units at any depth. */
    private fun mixed(node: OrderedNode): Boolean = (node.content.any { it.type == "text" } && node.content.any { it.type == "child" }) || node.content.mapNotNull { it.node }.any(::mixed)

    /** Publication/generation conflicts retain the existing HTTP status and reason. */
    private fun stale(message: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, message)
}

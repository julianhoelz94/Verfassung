package com.constitutionatlas.content.service

import com.constitutionatlas.content.CatalogUnavailableException
import com.constitutionatlas.content.api.OrderedNode
import com.constitutionatlas.content.api.OrderedNodeWrite
import com.constitutionatlas.content.api.OrderedSnapshot
import com.constitutionatlas.content.api.OrderedSnapshotWrite
import com.constitutionatlas.content.api.ResolvedContent
import com.constitutionatlas.content.client.CatalogClient
import com.constitutionatlas.content.client.StructuralSettings
import com.constitutionatlas.content.repo.OrderedContentRepository
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.readerPassageHref
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@Service
class OrderedContentService(
    private val receipts: com.constitutionatlas.content.repo.OrderedPublishReceiptRepository,
    private val repository: OrderedContentRepository,
    private val catalog: CatalogClient,
    @Value("\${content.ordered-mixed-writes.enabled:true}") private val mixedWritesEnabled: Boolean,
) {
    /** Seal only the already approved content; this operation cannot write or replace roots. */
    @Transactional
    fun sealImport(version: UUID, attempt: UUID, generation: Long, settings: UUID): OrderedSnapshot {
        catalog.requireImportReservation(version, attempt)
        val snapshot = get(version)
        if (repository.lock(version) != generation || snapshot.generation != generation || snapshot.settingsRevisionId != settings || snapshot.roots.isEmpty()) stale("Approved import content or settings changed")
        OrderedContentRules.requireValid(OrderedContentRules.contentErrors(snapshot.roots))
        val hash = "import:$version:$generation:$settings"
        receipts.find(attempt)?.let { existing ->
            if (existing.versionId != version || existing.requestHash != hash || existing.generation != generation) stale("Import publication attempt changed")
            return snapshot
        }
        if (receipts.forVersion(version) != null) stale("Snapshot is sealed for another publication")
        if (catalog.getVersion(version)?.publicationStatus != "draft") stale("Import snapshot is no longer a draft")
        receipts.insert(attempt, version, hash, generation)
        return snapshot
    }

    @Transactional
    fun get(version: UUID): OrderedSnapshot {
        if (!repository.exists(version) && catalog.getVersion(version) == null) throw NotFoundException("Unknown version '$version'")
        repository.refreshLegacy(version)
        val snapshot = repository.snapshot(version)
        if (snapshot.settingsRevisionId == null) {
            val metadata = catalog.getVersion(version)
            val settings = catalog.getSettings(version)
            if (metadata?.constitutionId != null && settings != null) repository.bind(version, metadata.constitutionId, settings.id)
        }
        return repository.snapshot(version)
    }

    /**
     * Revision references may reuse only members of the pinned source/target snapshots.
     * Changed nodes receive new immutable revisions; the generation check protects
     * concurrent writers and publication receipts make retries payload-specific.
     */
    @Transactional
    fun save(version: UUID, request: OrderedSnapshotWrite): OrderedSnapshot =
        OrderedContentWrite(receipts, repository, catalog, mixedWritesEnabled, ::get, ::validate).save(version, request)

    @Transactional
    fun export(version: UUID): com.constitutionatlas.content.api.OrderedContentExport {
        val snapshot = get(version)
        fun nodeWrite(node: OrderedNode): OrderedNodeWrite = OrderedNodeWrite(
            logicalId = node.logicalId,
            predecessorRevisionId = repository.revisionPredecessor(node.revisionId, false),
            kind = node.kind,
            label = node.label,
            title = node.title,
            lineage = node.lineage,
            content = node.content.map { entry ->
                entry.node?.let { com.constitutionatlas.platform.OrderedEntryWrite("child", node = nodeWrite(it)) }
                    ?: com.constitutionatlas.platform.OrderedEntryWrite("text", logicalId = entry.logicalId, predecessorRevisionId = entry.revisionId?.let { repository.revisionPredecessor(it, true) }, text = entry.text, lineage = entry.lineage, format = entry.format, table = entry.table, footnoteLabel = entry.footnoteLabel, references = entry.references, annotation = entry.annotation, marks = entry.marks, lineBreaksBefore = entry.lineBreaksBefore)
            },
        )
        return com.constitutionatlas.content.api.OrderedContentExport(version, snapshot.settingsRevisionId, snapshot.roots.map(::nodeWrite))
    }

    @Transactional
    fun publishReceipt(version: UUID, attempt: UUID): OrderedSnapshot {
        val receipt = receipts.find(attempt) ?: throw NotFoundException("No complete successor roots")
        if (receipt.versionId != version) throw NotFoundException("Receipt belongs to another version")
        val snapshot = get(version)
        if (snapshot.generation != receipt.generation) stale("Reserved roots changed")
        OrderedContentRules.requireValid(OrderedContentRules.contentErrors(snapshot.roots))
        return snapshot
    }

    /** Validates a complete resolved snapshot without changing hierarchy or rich-error precedence. */
    fun validate(roots: List<OrderedNode>, settings: StructuralSettings) = OrderedSnapshotValidation(settings).validate(roots)

    @Transactional
    fun resolve(version: UUID, logical: UUID): ResolvedContent {
        val metadata = catalog.getVersion(version) ?: throw NotFoundException("Version '$version' not found")
        val constitutionId = metadata.constitutionId ?: throw NotFoundException("Version '$version' not found")
        fun link(occurrence: UUID): String = readerPassageHref(metadata.countryCode, metadata.jurisdictionId, version, occurrence)
            ?: throw CatalogUnavailableException("Catalog did not supply a reader location")
        val snapshot = get(version)
        fun label(node: OrderedNode): String = listOfNotNull(node.kind, node.label, node.title).joinToString(" ")
        fun walk(node: OrderedNode, path: List<UUID>, pathLabels: List<String>, root: UUID, rootLabel: String?): ResolvedContent? {
            if (node.logicalId == logical) return ResolvedContent(version, constitutionId, logical, node.revisionId, node.occurrenceId, root, path.lastOrNull(), path, pathLabels + label(node), node.kind, rootLabel, plainText(node), link(node.occurrenceId))
            node.content.forEach { entry ->
                if (entry.logicalId == logical) return ResolvedContent(version, constitutionId, logical, entry.revisionId!!, entry.occurrenceId!!, root, node.logicalId, path + node.logicalId, pathLabels + label(node) + "Parent text", "parent_text", rootLabel, entry.text!!, link(entry.occurrenceId!!))
                entry.node?.let { walk(it, path + node.logicalId, pathLabels + label(node), root, rootLabel)?.let { found -> return found } }
            }
            return null
        }
        return snapshot.roots.firstNotNullOfOrNull { walk(it, emptyList(), emptyList(), it.occurrenceId, it.label) } ?: throw NotFoundException("Unit '$logical' is not in version '$version'")
    }

    fun plainText(node: OrderedNode): String = com.constitutionatlas.platform.OrderedContentText.entries(node.content)

    private fun stale(message: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, message)
}

package com.constitutionatlas.content.service

import com.constitutionatlas.content.CatalogUnavailableException
import com.constitutionatlas.content.VersionPublishedException
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
import com.constitutionatlas.platform.OrderedRichContent
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
    fun save(version: UUID, request: OrderedSnapshotWrite): OrderedSnapshot {
        val requestHash = com.constitutionatlas.platform.OrderedWriteFingerprint.current(request)
        val acceptedHashes = com.constitutionatlas.platform.OrderedWriteFingerprint.accepted(request)
        request.publishAttemptId?.let { attempt ->
            receipts.find(attempt)?.let { receipt ->
                if (receipt.versionId != version || receipt.requestHash !in acceptedHashes) stale("Publish attempt payload changed")
                val snapshot = get(version)
                if (snapshot.generation != receipt.generation) stale("Reserved roots changed")
                OrderedContentRules.requireValid(OrderedContentRules.contentErrors(snapshot.roots))
                return snapshot
            }
        }
        if (receipts.forVersion(version) != null) stale("Successor roots are sealed for publication")
        val metadata = catalog.getVersion(version) ?: throw NotFoundException("Unknown version '$version'")
        if (metadata.publicationStatus == "published") throw VersionPublishedException()
        val constitution = metadata.constitutionId ?: throw CatalogUnavailableException("Catalog did not supply constitution identity")
        val settings = catalog.getSettings(version) ?: throw CatalogUnavailableException("Version-pinned settings unavailable")
        val current = get(version)
        request.publishAttemptId?.let { attempt ->
            receipts.find(attempt)?.let { receipt ->
                if (receipt.versionId != version || receipt.requestHash !in acceptedHashes || receipt.generation != current.generation) stale("Publish attempt payload or roots changed")
                OrderedContentRules.requireValid(OrderedContentRules.contentErrors(current.roots))
                return current
            }
        }
        if (receipts.forVersion(version) != null) stale("Successor roots are sealed for publication")
        if (repository.lock(version) != request.expectedGeneration) stale("Target roots changed")
        if (receipts.forVersion(version) != null) stale("Successor roots are sealed for publication")
        val source = request.sourceVersionId?.let { sourceVersion ->
            val sourceMetadata = catalog.getVersion(sourceVersion) ?: throw NotFoundException("Unknown source version")
            if (request.publishAttemptId != null && sourceMetadata.publicationStatus != "published") stale("Successor source must be published")
            require(sourceMetadata.constitutionId == constitution) { "Cross-constitution source reference" }
            val resolved = get(sourceVersion)
            if (request.sourceGeneration != resolved.generation) stale("Source roots changed")
            resolved
        }
        val allowedNodes = mutableMapOf<UUID, OrderedNode>()
        val allowedTexts = mutableMapOf<UUID, Pair<UUID, String>>()
        fun collect(node: OrderedNode) {
            allowedNodes[node.revisionId] = node
            node.content.forEach { entry ->
                entry.node?.let(::collect)
                entry.revisionId?.let { allowedTexts[it] = entry.logicalId!! to entry.text!! }
            }
        }
        current.roots.forEach(::collect)
        source?.roots?.forEach(::collect)
        fun store(node: OrderedNodeWrite, depth: Int): UUID {
            require(depth < 128) { "Hierarchy exceeds 128 levels" }
            node.revisionId?.let { revision ->
                require(node.content == null && node.kind == null && node.logicalId == null && node.predecessorRevisionId == null && node.label == null && node.title == null && node.lineage.isEmpty()) { "A revision reference cannot also contain changed node fields" }
                require(revision in allowedNodes) { "Node revision is not a member of source or target snapshot" }
                return revision
            }
            val kind = node.kind ?: throw IllegalArgumentException("kind is required for a changed node")
            val entries = node.content ?: throw IllegalArgumentException("content is required for a changed node")
            val logical = node.logicalId ?: UUID.randomUUID()
            node.predecessorRevisionId?.let { predecessor ->
                require(allowedNodes[predecessor]?.logicalId == logical) { "Node predecessor is not the pinned logical unit" }
            }
            if (allowedNodes.values.any { it.logicalId == logical }) require(node.predecessorRevisionId != null) { "Existing logical unit requires its predecessor revision" }
            require(node.lineage.all { it in allowedNodes }) { "Unknown split/merge node lineage" }
            val revision = UUID.randomUUID()
            repository.insertNode(revision, logical, version, node.predecessorRevisionId, kind, node.label, node.title, lineage = node.lineage)
            entries.forEachIndexed { position, entry ->
                when (entry.type) {
                    "child" -> {
                        require(entry.node != null && entry.text == null && entry.revisionId == null && entry.logicalId == null && entry.predecessorRevisionId == null && entry.lineage.isEmpty() && entry.format == null && entry.table == null && entry.footnoteLabel == null && entry.references.isEmpty() && entry.annotation == null && entry.marks.isEmpty()) { "Invalid child entry at $logical/content/$position" }
                        repository.insertEntry(revision, position, null, store(requireNotNull(entry.node), depth + 1))
                    }
                    "text" -> {
                        require(entry.node == null) { "Text entry cannot contain a child" }
                        val textRevision = if (entry.revisionId != null) {
                            require(entry.text == null && entry.logicalId == null && entry.predecessorRevisionId == null && entry.lineage.isEmpty() && entry.format == null && entry.table == null && entry.footnoteLabel == null && entry.references.isEmpty() && entry.annotation == null && entry.marks.isEmpty()) { "Text reference cannot contain changed fields" }
                            require(entry.revisionId in allowedTexts) { "Text reference is not in the pinned snapshot" }
                            entry.revisionId
                        } else {
                            val format = entry.format ?: "plain"
                            require(format in setOf("plain", "table", "footnote")) { "Unknown rich content format at $logical/content/$position" }
                            require((format == "table") == (entry.table != null)) { "Table payload and format must agree at $logical/content/$position" }
                            require(format == "footnote" || (entry.footnoteLabel == null && entry.annotation == null)) { "Footnote label needs a footnote entry" }
                            require(format == "plain" || entry.references.isEmpty()) { "Inline references need a plain text entry" }
                            val text = if (format == "table") entry.table!!.plainText() else entry.text ?: throw IllegalArgumentException("Text is required at $logical/content/$position")
                            if (format == "table" && entry.text != null) require(entry.text == text) { "Table text does not match cells at $logical/content/$position" }
                            val textLogical = entry.logicalId ?: UUID.randomUUID()
                            entry.predecessorRevisionId?.let { require(allowedTexts[it]?.first == textLogical) { "Text predecessor does not match logical identity" } }
                            if (allowedTexts.values.any { it.first == textLogical }) require(entry.predecessorRevisionId != null) { "Existing text identity requires its predecessor revision" }
                            require(entry.lineage.all { it in allowedTexts }) { "Unknown split/merge lineage" }
                            val id = UUID.randomUUID()
                            repository.insertText(id, textLogical, version, entry.predecessorRevisionId, text, entry.lineage, format, OrderedRichContent(entry.table, entry.footnoteLabel, entry.references, entry.annotation, entry.marks))
                            id
                        }
                        repository.insertEntry(revision, position, textRevision, null)
                    }
                    else -> throw IllegalArgumentException("Entry type must be text or child at $logical/content/$position")
                }
            }
            repository.seal(revision)
            return revision
        }
        val roots = request.roots.map { store(it, 0) }
        val resolved = roots.map { repository.resolveNode(version, it, emptySet()) }
        validate(resolved, settings)
        fun mixed(node: OrderedNode): Boolean = (node.content.any { it.type == "text" } && node.content.any { it.type == "child" }) || node.content.mapNotNull { it.node }.any(::mixed)
        if (!mixedWritesEnabled && resolved.any(::mixed)) throw ResponseStatusException(HttpStatus.CONFLICT, "Mixed snapshot writes await ordered reader and consumer rollout")
        repository.bind(version, constitution, settings.id)
        repository.replaceRoots(version, roots, source = source)
        val saved = repository.snapshot(version)
        request.publishAttemptId?.let { receipts.insert(it, version, requestHash, saved.generation) }
        return saved
    }

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
                    ?: com.constitutionatlas.platform.OrderedEntryWrite("text", logicalId = entry.logicalId, predecessorRevisionId = entry.revisionId?.let { repository.revisionPredecessor(it, true) }, text = entry.text, lineage = entry.lineage, format = entry.format, table = entry.table, footnoteLabel = entry.footnoteLabel, references = entry.references, annotation = entry.annotation, marks = entry.marks)
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

    fun validate(roots: List<OrderedNode>, settings: StructuralSettings) {
        val identities = mutableSetOf<UUID>()
        val levels = settings.outline.kinds
        val byCode = levels.associateBy { it.kindCode }
        val rootsAllowed = levels.filter { it.root }.map { it.kindCode }.toSet().ifEmpty { setOfNotNull(levels.firstOrNull()?.kindCode) }
        fun walk(node: OrderedNode, parent: com.constitutionatlas.content.client.StructuralLevel?) {
            require(identities.add(node.logicalId)) { "Duplicate node logical identity '${node.logicalId}'" }
            val level = byCode[node.kind] ?: throw IllegalArgumentException("Unknown kind '${node.kind}' at '${node.logicalId}'")
            require(if (parent == null) node.kind in rootsAllowed else node.kind in parent.allowedChildKinds) {
                "Invalid kind '${node.kind}' at '${node.logicalId}' ${if (parent == null) "at the root" else "under '${parent.kindCode}'"}"
            }
            fun policy(value: String?, policy: String, field: String) {
                require(policy != "required" || !value.isNullOrBlank()) { "$field is required at '${node.logicalId}'" }
                require(policy != "none" || value.isNullOrEmpty()) { "$field is not permitted at '${node.logicalId}'" }
            }
            policy(node.title, level.titlePolicy, "Title")
            policy(node.label, level.labelPolicy, "Literal label")
            node.content.forEach { entry ->
                if (entry.type == "child") {
                    require(level.mayHoldChildren && entry.node!!.kind in level.allowedChildKinds) { "Child kind is not permitted at '${node.logicalId}'" }
                    walk(entry.node!!, level)
                } else {
                    require(level.mayHoldText) { "Parent text is not permitted at '${node.logicalId}'" }
                    require(identities.add(entry.logicalId!!)) { "Duplicate text logical identity '${entry.logicalId}'" }
                }
            }
        }
        roots.forEach { walk(it, null) }
        OrderedContentRules.requireValid(OrderedContentRules.endnoteErrors(OrderedContentRules.positions(roots)))
        fun collect(node: OrderedNode, footnotes: MutableSet<UUID>) {
            node.content.forEach { entry ->
                entry.node?.let { collect(it, footnotes) }
                if (entry.format == "footnote") footnotes += requireNotNull(entry.logicalId)
            }
        }
        fun rich(node: OrderedNode, footnotes: Set<UUID>) {
            node.content.forEach { entry ->
                entry.node?.let { rich(it, footnotes) }
                entry.table?.let { table ->
                    require(entry.format == "table" && table.rows.isNotEmpty()) { "Table needs rows at '${node.logicalId}'" }
                    val rowIds = mutableSetOf<UUID>()
                    val cellIds = mutableSetOf<UUID>()
                    val headerIds = table.rows.flatMap { it.cells }.filter { it.header }.map { it.logicalId }.toSet()
                    table.rows.forEach { row ->
                        require(rowIds.add(row.logicalId) && row.cells.isNotEmpty()) { "Duplicate or empty table row at '${node.logicalId}'" }
                        row.cells.forEach { cell ->
                            require(cellIds.add(cell.logicalId) && cell.rowSpan in 1..100 && cell.colSpan in 1..100) { "Invalid table cell at '${node.logicalId}'" }
                            require(cell.headers.all { it in headerIds }) { "Unknown table header at '${node.logicalId}'" }
                        }
                    }
                }
                entry.annotation?.let { annotation ->
                    annotation.validate()
                    require(entry.format == "footnote") { "Annotations must be anchored notes" }
                    require(annotation.anchorLogicalIds.all { it in identities }) { "Annotation has an unknown unit anchor" }
                }
                OrderedContentRules.requireValid(OrderedContentRules.markErrors(entry.text.orEmpty(), entry.format, entry.marks, "node[${node.logicalId}].text[${entry.logicalId}].marks", entry.logicalId))
                if (entry.format == "footnote") require(!entry.text.isNullOrBlank() && entry.table == null) { "Footnote text is required at '${node.logicalId}'" }
                OrderedContentRules.requireValid(OrderedContentRules.referenceErrors(entry.text.orEmpty(), entry.format, entry.references, footnotes, "node[${node.logicalId}].text[${entry.logicalId}]", entry.logicalId, units = identities))
            }
        }
        val footnotes = mutableSetOf<UUID>()
        roots.forEach { collect(it, footnotes) }
        roots.forEach { rich(it, footnotes) }
    }

    @Transactional
    fun resolve(version: UUID, logical: UUID): ResolvedContent {
        val constitutionId = catalog.getVersion(version)?.constitutionId ?: throw NotFoundException("Version '$version' not found")
        val snapshot = get(version)
        fun label(node: OrderedNode): String = listOfNotNull(node.kind, node.label, node.title).joinToString(" ")
        fun walk(node: OrderedNode, path: List<UUID>, pathLabels: List<String>, root: UUID, rootLabel: String?): ResolvedContent? {
            if (node.logicalId == logical) return ResolvedContent(version, constitutionId, logical, node.revisionId, node.occurrenceId, root, path.lastOrNull(), path, pathLabels + label(node), node.kind, rootLabel, plainText(node), "/versions/$version/units/$root?occurrenceId=${node.occurrenceId}")
            node.content.forEach { entry ->
                if (entry.logicalId == logical) return ResolvedContent(version, constitutionId, logical, entry.revisionId!!, entry.occurrenceId!!, root, node.logicalId, path + node.logicalId, pathLabels + label(node) + "Parent text", "parent_text", rootLabel, entry.text!!, "/versions/$version/units/$root?occurrenceId=${entry.occurrenceId}")
                entry.node?.let { walk(it, path + node.logicalId, pathLabels + label(node), root, rootLabel)?.let { found -> return found } }
            }
            return null
        }
        return snapshot.roots.firstNotNullOfOrNull { walk(it, emptyList(), emptyList(), it.occurrenceId, it.label) } ?: throw NotFoundException("Unit '$logical' is not in version '$version'")
    }

    fun plainText(node: OrderedNode): String = com.constitutionatlas.platform.OrderedContentText.entries(node.content)

    private fun stale(message: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, message)
}

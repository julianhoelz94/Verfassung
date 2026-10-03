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

    @Transactional
    fun save(version: UUID, request: OrderedSnapshotWrite): OrderedSnapshot {
        val requestHash = java.security.MessageDigest.getInstance("SHA-256").digest(request.toString().toByteArray()).joinToString("") { "%02x".format(it) }
        request.publishAttemptId?.let { attempt ->
            receipts.find(attempt)?.let { receipt ->
                if (receipt.versionId != version || receipt.requestHash != requestHash) stale("Publish attempt payload changed")
                val snapshot = get(version)
                if (snapshot.generation != receipt.generation) stale("Reserved roots changed")
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
                if (receipt.versionId != version || receipt.requestHash != requestHash || receipt.generation != current.generation) stale("Publish attempt payload or roots changed")
                return current
            }
        }
        if (receipts.forVersion(version) != null) stale("Successor roots are sealed for publication")
        if (repository.lock(version) != request.expectedGeneration) stale("Target roots changed")
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
                        require(entry.node != null && entry.text == null && entry.revisionId == null && entry.logicalId == null && entry.predecessorRevisionId == null && entry.lineage.isEmpty()) { "Invalid child entry at $logical/content/$position" }
                        repository.insertEntry(revision, position, null, store(requireNotNull(entry.node), depth + 1))
                    }
                    "text" -> {
                        require(entry.node == null) { "Text entry cannot contain a child" }
                        val textRevision = if (entry.revisionId != null) {
                            require(entry.text == null && entry.logicalId == null && entry.predecessorRevisionId == null && entry.lineage.isEmpty()) { "Text reference cannot contain changed fields" }
                            require(entry.revisionId in allowedTexts) { "Text reference is not in the pinned snapshot" }
                            entry.revisionId
                        } else {
                            val text = entry.text ?: throw IllegalArgumentException("Text is required at $logical/content/$position")
                            val textLogical = entry.logicalId ?: UUID.randomUUID()
                            entry.predecessorRevisionId?.let { require(allowedTexts[it]?.first == textLogical) { "Text predecessor does not match logical identity" } }
                            if (allowedTexts.values.any { it.first == textLogical }) require(entry.predecessorRevisionId != null) { "Existing text identity requires its predecessor revision" }
                            require(entry.lineage.all { it in allowedTexts }) { "Unknown split/merge lineage" }
                            val id = UUID.randomUUID()
                            repository.insertText(id, textLogical, version, entry.predecessorRevisionId, text, entry.lineage)
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
            kind = node.kind,
            label = node.label,
            title = node.title,
            content = node.content.map { entry ->
                entry.node?.let { com.constitutionatlas.platform.OrderedEntryWrite("child", node = nodeWrite(it)) }
                    ?: com.constitutionatlas.platform.OrderedEntryWrite("text", logicalId = entry.logicalId, text = entry.text)
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
        return snapshot
    }

    fun validate(roots: List<OrderedNode>, settings: StructuralSettings) {
        val identities = mutableSetOf<UUID>()
        fun walk(node: OrderedNode, depth: Int) {
            require(identities.add(node.logicalId)) { "Duplicate node logical identity '${node.logicalId}'" }
            val level = settings.outline.kinds.getOrNull(depth) ?: throw IllegalArgumentException("Unexpected level at '${node.logicalId}'")
            require(node.kind == level.kindCode) { "Invalid kind '${node.kind}' at '${node.logicalId}'; expected '${level.kindCode}'" }
            fun policy(value: String?, policy: String, field: String) {
                require(policy != "required" || !value.isNullOrBlank()) { "$field is required at '${node.logicalId}'" }
                require(policy != "none" || value.isNullOrEmpty()) { "$field is not permitted at '${node.logicalId}'" }
            }
            policy(node.title, level.titlePolicy, "Title")
            policy(node.label, level.labelPolicy, "Literal label")
            node.content.forEach { entry ->
                if (entry.type == "child") {
                    require(level.mayHoldChildren && entry.node!!.kind in level.allowedChildKinds) { "Child kind is not permitted at '${node.logicalId}'" }
                    walk(entry.node!!, depth + 1)
                } else {
                    require(level.mayHoldText) { "Parent text is not permitted at '${node.logicalId}'" }
                    require(identities.add(entry.logicalId!!)) { "Duplicate text logical identity '${entry.logicalId}'" }
                }
            }
        }
        roots.forEach { walk(it, 0) }
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

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
class OrderedContentService(private val repository: OrderedContentRepository, private val catalog: CatalogClient, @Value("\${content.ordered-mixed-writes.enabled:false}") private val mixedWritesEnabled: Boolean) {
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
        val metadata = catalog.getVersion(version) ?: throw NotFoundException("Unknown version '$version'")
        if (metadata.publicationStatus == "published") throw VersionPublishedException()
        val constitution = metadata.constitutionId ?: throw CatalogUnavailableException("Catalog did not supply constitution identity")
        val settings = catalog.getSettings(version) ?: throw CatalogUnavailableException("Version-pinned settings unavailable")
        val current = get(version)
        if (repository.lock(version) != request.expectedGeneration) stale("Target roots changed")
        val source = request.sourceVersionId?.let { sourceVersion ->
            val sourceMetadata = catalog.getVersion(sourceVersion) ?: throw NotFoundException("Unknown source version")
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
                require(node.content == null && node.kind == null && node.logicalId == null && node.predecessorRevisionId == null && node.label == null && node.title == null) { "A revision reference cannot also contain changed node fields" }
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
            val revision = UUID.randomUUID()
            repository.insertNode(revision, logical, version, node.predecessorRevisionId, kind, node.label, node.title)
            entries.forEachIndexed { position, entry ->
                when (entry.type) {
                    "child" -> {
                        require(entry.node != null && entry.text == null && entry.revisionId == null && entry.logicalId == null && entry.predecessorRevisionId == null && entry.lineage.isEmpty()) { "Invalid child entry at $logical/content/$position" }
                        repository.insertEntry(revision, position, null, store(entry.node, depth + 1))
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
        return repository.snapshot(version)
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
        val snapshot = get(version)
        fun walk(node: OrderedNode, path: List<UUID>): ResolvedContent? {
            if (node.logicalId == logical) return ResolvedContent(version, logical, node.revisionId, node.occurrenceId, path.lastOrNull(), path, node.kind, plainText(node), "/api/content/versions/$version/resolve?logicalId=$logical")
            node.content.forEach { entry ->
                if (entry.logicalId == logical) return ResolvedContent(version, logical, entry.revisionId!!, entry.occurrenceId!!, node.logicalId, path + node.logicalId, "parent_text", entry.text!!, "/api/content/versions/$version/resolve?logicalId=$logical")
                entry.node?.let { walk(it, path + node.logicalId)?.let { found -> return found } }
            }
            return null
        }
        return snapshot.roots.firstNotNullOfOrNull { walk(it, emptyList()) } ?: throw NotFoundException("Unit '$logical' is not in version '$version'")
    }

    fun plainText(node: OrderedNode): String = node.content.joinToString(" ") { it.node?.let(::plainText) ?: it.text.orEmpty() }

    private fun stale(message: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, message)
}

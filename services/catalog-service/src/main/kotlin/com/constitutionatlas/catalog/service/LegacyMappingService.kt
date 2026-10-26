package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.LegacyMapping
import com.constitutionatlas.catalog.api.LegacyMappingRequest
import com.constitutionatlas.catalog.api.LegacyResolution
import com.constitutionatlas.catalog.client.ArchiveTargetClient
import com.constitutionatlas.catalog.repo.CatalogRepository
import com.constitutionatlas.catalog.repo.LegacyMappingRepository
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.OrderedNode
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URI
import java.util.UUID

@Service
class LegacyMappingService(
    private val mappings: LegacyMappingRepository,
    private val catalog: CatalogRepository,
    private val targets: ArchiveTargetClient,
    @Value("\${archive.legacy.hosts:www.verfassungen.de,verfassungen.de,legacy.localhost}") hosts: String,
) {
    private val allowedHosts = hosts.split(',').map { it.trim().lowercase() }.toSet()
    private fun key(url: String): String {
        require(url.length <= 2048) { "Legacy URL exceeds limit" }
        val uri = URI(url)
        require(uri.scheme in setOf("http", "https") && uri.host?.lowercase() in allowedHosts && uri.userInfo == null && (uri.port == -1 || uri.host == "legacy.localhost" && uri.port in 1..65535)) { "Legacy URL must use a configured archive host" }
        require(uri.normalize().rawPath == uri.rawPath) { "Legacy URL contains a relative path" }
        return "${uri.host.lowercase()}${uri.rawPath.ifEmpty { "/" }}${uri.rawQuery?.let { "?$it" }.orEmpty()}${uri.rawFragment?.let { "#$it" }.orEmpty()}"
    }

    @Transactional
    fun create(request: LegacyMappingRequest, actor: UUID, authorization: String?): LegacyMapping {
        val source = key(request.sourceUrl)
        targetUrl(request, authorization, publishedOnly = false)
        mappings.lock(source)
        mappings.find(source)?.let {
            if (it.target.copy(sourceUrl = request.sourceUrl) != request) throw ConflictException("Legacy source already has a different target", "ambiguous_legacy_mapping")
            return it
        }
        return mappings.insert(source, request, actor)
    }
    fun resolve(url: String): LegacyResolution {
        val mapping = mappings.find(key(url)) ?: throw NotFoundException("No exact legacy mapping; source or fragment remains unresolved")
        return LegacyResolution(mapping.id, mapping.sourceUrl, targetUrl(mapping.target, null, publishedOnly = true))
    }
    private fun targetUrl(target: LegacyMappingRequest, authorization: String?, publishedOnly: Boolean): String {
        require(target.kind in setOf("version", "unit", "note", "document")) { "Unsupported legacy target kind" }
        if (target.kind == "document") {
            require(target.versionId == null && target.logicalId == null && target.documentId != null && target.documentRevision != null && target.documentRevision > 0) { "Document mapping requires an exact document revision" }
            targets.document(target.documentId, target.documentRevision, authorization)
            return "/documents/${target.documentId}?revision=${target.documentRevision}"
        }
        require(target.versionId != null && target.documentId == null && target.documentRevision == null) { "Content mapping requires an exact version" }
        val version = catalog.findVersion(target.versionId) ?: throw NotFoundException("Legacy target version is missing")
        if (publishedOnly && version.publicationStatus != "published") throw NotFoundException("Legacy target has not been published")
        val base = if (version.countryCode != null) "/countries/${version.countryCode}/versions/${version.id}" else "/jurisdictions/${version.jurisdictionId}/versions/${version.id}"
        if (target.kind == "version") {
            require(target.logicalId == null) { "Version mapping cannot contain a unit target" }
            return base
        }
        require(target.logicalId != null) { "Unit and note mappings require a logical target" }
        val snapshot = targets.snapshot(version.id, authorization)
        var foundNode: OrderedNode? = null
        var foundEntry: OrderedEntry? = null
        fun visit(node: OrderedNode) {
            if (node.logicalId == target.logicalId) foundNode = node
            node.content.forEach { entry ->
                if (entry.logicalId == target.logicalId) foundEntry = entry
                entry.node?.let(::visit)
            }
        }
        require(snapshot.versionId == version.id) { "Content target returned a different snapshot" }
        snapshot.roots.forEach(::visit)
        val fragment = if (target.kind == "unit") foundNode?.occurrenceId?.toString() else foundEntry?.takeIf { it.format == "footnote" }?.occurrenceId?.let { "fn-$it" }
        return "$base#${fragment ?: throw NotFoundException("Legacy target does not exist in the pinned version") }"
    }
}

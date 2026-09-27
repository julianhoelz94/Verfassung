package com.constitutionatlas.content.repo

import com.constitutionatlas.content.api.OrderedEntry
import com.constitutionatlas.content.api.OrderedNode
import com.constitutionatlas.content.api.OrderedSnapshot
import com.constitutionatlas.platform.NotFoundException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.UUID

@Repository
class OrderedContentRepository(private val jdbc: JdbcTemplate) {
    fun exists(version: UUID): Boolean = jdbc.queryForObject("SELECT COUNT(*) FROM content_snapshots WHERE version_id = ?", Int::class.java, version)!! > 0

    fun seal(revision: UUID) {
        jdbc.update("UPDATE content_node_revisions SET sealed = TRUE WHERE id = ? AND NOT sealed", revision)
    }
    fun canonical(versionId: UUID): Boolean = jdbc.query(
        "SELECT canonical FROM content_snapshots WHERE version_id = ?",
        { rs, _ -> rs.getBoolean(1) },
        versionId,
    ).firstOrNull() ?: false

    fun invalidateLegacy(versionId: UUID) {
        jdbc.update("UPDATE content_snapshots SET legacy_dirty = TRUE WHERE version_id = ?", versionId)
    }

    fun lock(versionId: UUID): Long {
        jdbc.update("INSERT INTO content_snapshots(version_id, legacy_dirty) VALUES (?, TRUE) ON CONFLICT DO NOTHING", versionId)
        return jdbc.queryForObject("SELECT generation FROM content_snapshots WHERE version_id = ? FOR UPDATE", Long::class.java, versionId)!!
    }

    fun refreshLegacy(versionId: UUID) {
        lock(versionId)
        val dirty = jdbc.queryForObject("SELECT legacy_dirty FROM content_snapshots WHERE version_id = ?", Boolean::class.java, versionId)!!
        if (!dirty || canonical(versionId)) return
        val nodes = jdbc.query(
            "SELECT id, parent_id, kind, COALESCE(label, number) AS label, title, body, predecessor_id FROM content_nodes WHERE version_id = ? ORDER BY sort_order, id",
            { rs, _ -> LegacyNode(rs.getObject("id", UUID::class.java), rs.getObject("parent_id", UUID::class.java), rs.getString("kind"), rs.getString("label"), rs.getString("title"), rs.getString("body"), rs.getObject("predecessor_id", UUID::class.java)) },
            versionId,
        )
        val revisions = nodes.associate { it.id to UUID.randomUUID() }
        val logicalIds = nodes.associate { node ->
            node.id to (
                node.predecessorId?.let { predecessor ->
                    jdbc.query("SELECT logical_id FROM content_occurrences WHERE id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, predecessor).firstOrNull()
                } ?: node.id
                )
        }
        nodes.forEach { node ->
            insertNode(
                revisions.getValue(node.id),
                logicalIds.getValue(node.id),
                versionId,
                null,
                node.kind,
                node.label,
                node.title,
                node.body != null && nodes.any { it.parentId == node.id },
            )
        }
        nodes.forEach { node ->
            var position = 0
            node.body?.let { body ->
                val textRevision = UUID.randomUUID()
                val textLogical = legacyBodyLogicalId(logicalIds.getValue(node.id))
                insertText(textRevision, textLogical, versionId, null, body, emptyList())
                insertEntry(revisions.getValue(node.id), position++, textRevision, null)
            }
            nodes.filter { it.parentId == node.id }.forEach { child -> insertEntry(revisions.getValue(node.id), position++, null, revisions.getValue(child.id)) }
            seal(revisions.getValue(node.id))
        }
        replaceRoots(versionId, nodes.filter { it.parentId == null }.map { revisions.getValue(it.id) }, canonical = false)
        nodes.forEach { node ->
            jdbc.update("UPDATE content_occurrences SET id = ? WHERE version_id = ? AND logical_id = ? AND id <> ?", node.id, versionId, logicalIds.getValue(node.id), node.id)
        }
        jdbc.update("UPDATE content_snapshots SET legacy_dirty = FALSE WHERE version_id = ?", versionId)
    }

    fun insertNode(id: UUID, logical: UUID, version: UUID, predecessor: UUID?, kind: String, label: String?, title: String?, inferred: Boolean = false) {
        jdbc.update("INSERT INTO content_node_revisions(id, logical_id, origin_version_id, predecessor_id, kind, label, title, order_inferred) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, logical, version, predecessor, kind, label, title, inferred)
    }

    fun insertText(id: UUID, logical: UUID, version: UUID, predecessor: UUID?, text: String, lineage: List<UUID>) {
        jdbc.update({ connection ->
            connection.prepareStatement("INSERT INTO content_text_revisions(id, logical_id, origin_version_id, predecessor_id, text, lineage) VALUES (?, ?, ?, ?, ?, ?)").apply {
                setObject(1, id)
                setObject(2, logical)
                setObject(3, version)
                setObject(4, predecessor)
                setString(5, text)
                setArray(6, connection.createArrayOf("uuid", lineage.toTypedArray()))
            }
        })
    }

    fun insertEntry(parent: UUID, position: Int, text: UUID?, child: UUID?) {
        jdbc.update("INSERT INTO content_revision_entries(parent_revision_id, position, text_revision_id, child_revision_id) VALUES (?, ?, ?, ?)", parent, position, text, child)
    }

    fun bind(version: UUID, constitution: UUID, settings: UUID) {
        jdbc.update("UPDATE content_snapshots SET constitution_id = ?, settings_revision_id = ? WHERE version_id = ? AND (constitution_id IS NULL OR constitution_id = ?)", constitution, settings, version, constitution)
    }

    fun replaceRoots(version: UUID, roots: List<UUID>, canonical: Boolean = true, source: OrderedSnapshot? = null) {
        jdbc.update("DELETE FROM content_snapshot_roots WHERE version_id = ?", version)
        roots.forEachIndexed { index, revision -> jdbc.update("INSERT INTO content_snapshot_roots(version_id, position, revision_id) VALUES (?, ?, ?)", version, index, revision) }
        jdbc.update("UPDATE content_snapshots SET generation = generation + 1, canonical = ?, legacy_dirty = FALSE WHERE version_id = ?", canonical, version)
        val old = jdbc.query("SELECT logical_id, id FROM content_occurrences WHERE version_id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) to rs.getObject(2, UUID::class.java) }, version).toMap()
        // Draft occurrence IDs survive successive saves; published occurrence rows never change.
        val sourceOccurrences = mutableMapOf<UUID, UUID>()
        fun collectSource(node: OrderedNode) {
            sourceOccurrences[node.logicalId] = node.occurrenceId
            node.content.forEach { entry ->
                entry.node?.let(::collectSource)
                if (entry.type == "text") sourceOccurrences[entry.logicalId!!] = entry.occurrenceId!!
            }
        }
        source?.roots?.forEach(::collectSource)
        roots.forEach { root -> registerOccurrences(version, root, old, sourceOccurrences) }
    }

    private fun registerOccurrences(version: UUID, revision: UUID, old: Map<UUID, UUID>, source: Map<UUID, UUID>) {
        val node = nodeRecord(revision)
        occurrence(version, node.logicalId, revision, false, old[node.logicalId], source[node.logicalId])
        entryReferences(revision).forEach { (text, child) ->
            if (child != null) registerOccurrences(version, child, old, source)
            if (text != null) {
                val record = textRecord(text)
                occurrence(version, record.first, text, true, old[record.first], source[record.first])
            }
        }
    }

    private fun occurrence(version: UUID, logical: UUID, revision: UUID, text: Boolean, oldId: UUID?, predecessor: UUID?) {
        jdbc.update(
            "INSERT INTO content_occurrences(id, version_id, logical_id, node_revision_id, text_revision_id, predecessor_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (version_id, logical_id) DO UPDATE SET node_revision_id = EXCLUDED.node_revision_id, text_revision_id = EXCLUDED.text_revision_id, predecessor_id = COALESCE(content_occurrences.predecessor_id, EXCLUDED.predecessor_id)",
            oldId ?: UUID.nameUUIDFromBytes("$version:$logical".toByteArray()),
            version,
            logical,
            if (text) null else revision,
            if (text) revision else null,
            predecessor,
        )
    }

    fun snapshot(version: UUID): OrderedSnapshot {
        val metadata = jdbc.query("SELECT generation, settings_revision_id FROM content_snapshots WHERE version_id = ?", { rs, _ -> rs.getLong(1) to rs.getObject(2, UUID::class.java) }, version).firstOrNull()
            ?: throw NotFoundException("Unknown content snapshot '$version'")
        val roots = jdbc.query("SELECT revision_id FROM content_snapshot_roots WHERE version_id = ? ORDER BY position", { rs, _ -> rs.getObject(1, UUID::class.java) }, version)
        return OrderedSnapshot(version, metadata.first, metadata.second, roots.map { resolveNode(version, it, emptySet()) })
    }

    fun resolveNode(version: UUID, revision: UUID, path: Set<UUID>): OrderedNode {
        require(revision !in path) { "Cycle in revision references" }
        require(path.size < 128) { "Content hierarchy exceeds 128 levels" }
        val row = nodeRecord(revision)
        val content = entryReferences(revision).map { (text, child) ->
            if (child != null) {
                OrderedEntry("child", node = resolveNode(version, child, path + revision))
            } else {
                val record = textRecord(text!!)
                OrderedEntry("text", logicalId = record.first, revisionId = text, occurrenceId = occurrenceId(version, record.first), text = record.second)
            }
        }
        return OrderedNode(row.logicalId, revision, occurrenceId(version, row.logicalId), row.kind, row.label, row.title, content, row.inferred)
    }

    fun nodeRecord(revision: UUID): NodeRecord = jdbc.query(
        "SELECT logical_id, kind, label, title, order_inferred FROM content_node_revisions WHERE id = ?",
        { rs, _ -> NodeRecord(rs.getObject(1, UUID::class.java), rs.getString(2), rs.getString(3), rs.getString(4), rs.getBoolean(5)) },
        revision,
    ).firstOrNull() ?: throw NotFoundException("Unknown node revision '$revision'")

    fun textRecord(revision: UUID): Pair<UUID, String> = jdbc.query("SELECT logical_id, text FROM content_text_revisions WHERE id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) to rs.getString(2) }, revision).firstOrNull()
        ?: throw NotFoundException("Unknown text revision '$revision'")

    fun entryReferences(revision: UUID): List<Pair<UUID?, UUID?>> = jdbc.query("SELECT text_revision_id, child_revision_id FROM content_revision_entries WHERE parent_revision_id = ? ORDER BY position", { rs, _ -> rs.getObject(1, UUID::class.java) to rs.getObject(2, UUID::class.java) }, revision)

    fun occurrencePredecessor(id: UUID): UUID? = jdbc.query("SELECT predecessor_id FROM content_occurrences WHERE id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, id).firstOrNull()

    private fun legacyBodyLogicalId(logical: UUID): UUID {
        // Match PostgreSQL md5(logical_id::text || ':body')::uuid without UUID version-bit rewriting.
        val bytes = ByteBuffer.wrap(MessageDigest.getInstance("MD5").digest("$logical:body".toByteArray(Charsets.UTF_8)))
        return UUID(bytes.long, bytes.long)
    }

    fun occurrenceVersion(id: UUID): UUID? = jdbc.query("SELECT version_id FROM content_occurrences WHERE id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, id).firstOrNull()

    private fun occurrenceId(version: UUID, logical: UUID): UUID = jdbc.query("SELECT id FROM content_occurrences WHERE version_id = ? AND logical_id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, version, logical).firstOrNull()
        ?: UUID.nameUUIDFromBytes("$version:$logical".toByteArray())

    data class NodeRecord(val logicalId: UUID, val kind: String, val label: String?, val title: String?, val inferred: Boolean)
    private data class LegacyNode(val id: UUID, val parentId: UUID?, val kind: String, val label: String?, val title: String?, val body: String?, val predecessorId: UUID?)
}

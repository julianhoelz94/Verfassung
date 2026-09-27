package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.StructuredDraftPreview
import com.constitutionatlas.editor.client.CatalogVersion
import com.constitutionatlas.editor.client.OrderedPublishClient
import com.constitutionatlas.editor.client.StructuredSourceClient
import com.constitutionatlas.editor.repo.StructuredDraftRepository
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.OrderedSnapshotWrite
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class StructuredPublicationService(private val drafts: StructuredDraftRepository, private val sources: StructuredSourceClient, private val client: OrderedPublishClient) {
    fun lock(session: UUID) = drafts.lockSession(session)
    fun reservation(session: UUID, authorization: String?): CatalogVersion? = client.reservation(session, authorization)

    fun prepare(session: UUID, version: UUID): StructuredDraftPreview {
        val pin = drafts.pin(session) ?: throw ConflictException("No structured draft")
        val source = sources.source(version)
        val settings = sources.settings(version)
        if (source.generation != pin.sourceGeneration || source.settingsRevisionId != pin.settingsRevisionId || settings.id != pin.settingsRevisionId || source.roots.map { it.revisionId } != pin.rootRevisionIds) throw ConflictException("Pinned source changed", "stale_source")
        val operations = drafts.operations(session)
        return StructuredDraftPreview(session, version, pin.sourceGeneration, pin.settingsRevisionId, pin.generation, pin.rootRevisionIds, operations, StructuredDraftEngine.replay(source.roots, operations, settings))
    }

    fun changedSourceRootIndexes(preview: StructuredDraftPreview): Set<Int> {
        val original = sources.source(preview.sourceVersionId)
        val target = OrderedSuccessorPlan.build(original.roots, preview.roots, preview.operations).zip(preview.roots).associate { (write, node) -> node.logicalId to write }
        val targetPositions = preview.roots.mapIndexed { index, node -> node.logicalId to index }.toMap()
        return original.roots.mapIndexedNotNull { index, node ->
            if (target[node.logicalId]?.revisionId != node.revisionId || targetPositions[node.logicalId] != index) index else null
        }.toSet()
    }

    fun write(preview: StructuredDraftPreview, source: CatalogVersion, hopKind: String, comment: String?, authorization: String?): Pair<CatalogVersion, OrderedSnapshot> {
        val original = sources.source(source.id)
        if (original.generation != preview.sourceGeneration || original.roots.map { it.revisionId } != preview.sourceRootRevisionIds) throw ConflictException("Pinned source changed", "stale_source")
        val successor = client.reserve(preview.sessionId, source, hopKind, comment, preview.settingsRevisionId, authorization)
        val request = OrderedSnapshotWrite(0, source.id, preview.sourceGeneration, OrderedSuccessorPlan.build(original.roots, preview.roots, preview.operations), preview.sessionId)
        return successor to client.save(successor.id, request, authorization)
    }
}

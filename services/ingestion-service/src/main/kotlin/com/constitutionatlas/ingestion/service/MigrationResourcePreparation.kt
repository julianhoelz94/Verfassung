package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.DocumentRelationshipPayload
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.MigrationItem
import com.constitutionatlas.ingestion.client.MigrationDomainClient
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.scalarText
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.ObjectNode
import java.util.UUID

/** Prepares one claimed resource using the original run view and exact staged dependency pins. */
internal class MigrationResourcePreparation(
    private val imports: ImportService,
    private val domains: MigrationDomainClient,
    private val mapper: ObjectMapper,
    private val item: MigrationItem,
    private val items: List<MigrationItem>,
) {
    /** Dispatch remote preparation only; the owning service records attempts, failures and scrubbing. */
    fun prepare(payload: JsonNode, actor: Actor, authorization: String?): JsonNode = when (item.kind) {
        "snapshot" -> snapshot(payload, actor, authorization)
        "document", "citation" -> capture(payload, authorization)
        "amendment" -> amendment(payload, authorization)
        "document_link" -> documentLink(payload, authorization)
        "legacy_mapping" -> legacyMapping(payload, authorization)
        "comparison" -> comparison(payload, authorization)
        else -> throw IllegalArgumentException("Unsupported resource kind")
    }

    /** Resolve only explicitly declared, already prepared dependencies from the pre-claim run view. */
    private fun dependency(key: String): JsonNode {
        require(key in item.dependencies) { "Relationship target must be an explicit dependency" }
        return items.firstOrNull { it.sourceKey == key && it.state == "prepared" }?.result
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Relationship target is unresolved")
    }

    /** Reuse a prepared import; retry failed or unversioned jobs before decoding its staged target pin. */
    private fun snapshot(payload: JsonNode, actor: Actor, authorization: String?): JsonNode {
        val jobId = UUID.fromString(item.result.path("jobId").scalarText())
        var job = imports.getJob(jobId) ?: throw NotFoundException("Staged snapshot job is missing")
        if (job.versionId == null || job.status == "failed") job = imports.prepare(authorization, jobId, actor.id)
        if (job.versionId == null || job.status == "failed") throw ResponseStatusException(HttpStatus.CONFLICT, "Snapshot preparation failed: ${job.errors.joinToString { it.message }}")
        val request = mapper.treeToValue(payload, ImportRequest::class.java)
        return mapper.valueToTree(mapOf("jobId" to job.id, "versionId" to job.versionId, "constitutionId" to request.constitutionId, "status" to job.status))
    }

    /** Copy capture bytes before adding the stable item attempt identity and retaining both revision pins. */
    private fun capture(payload: JsonNode, authorization: String?): JsonNode {
        val request = (payload as ObjectNode).deepCopy().put("attemptId", item.id.toString())
        val document = domains.capture(request, authorization)
        return mapper.valueToTree(mapOf("documentId" to document.path("id"), "revisionId" to document.path("revision").path("id"), "revision" to document.path("revision").path("revision"), "fileSha256" to payload.path("fileSha256")))
    }

    /** Add the stable publication identity without mutating evidence, then require an exact revision pin. */
    private fun amendment(payload: JsonNode, authorization: String?): JsonNode {
        val constitution = UUID.fromString(payload.path("constitutionId").scalarText())
        val record = (payload.path("record") as ObjectNode).deepCopy().put("publishAttemptId", item.id.toString())
        val amendment = domains.amendment(constitution, record, authorization)
        require(!amendment.path("revisionId").isMissingNode && !amendment.path("revisionId").isNull) { "Prepared amendment has no revision pin" }
        return mapper.valueToTree(mapOf("amendmentId" to amendment.path("id"), "scopeRevisionId" to amendment.path("revisionId"), "status" to amendment.path("status")))
    }

    /** Validate the target type before resolving document then target pins and issuing the link write. */
    private fun documentLink(payload: JsonNode, authorization: String?): JsonNode {
        val request = mapper.treeToValue(payload, DocumentRelationshipPayload::class.java)
        require(request.targetType in setOf("constitution", "version", "amendment")) { "Unsupported relationship target" }
        val document = dependency(request.documentKey)
        val target = dependency(request.targetKey)
        val targetId = UUID.fromString(target.path("${request.targetType}Id").scalarText())
        val scope = if (request.targetType == "amendment") target.path("scopeRevisionId").scalarText().also { UUID.fromString(it) } else null
        domains.documentLink(request.targetType, targetId, mapOf("documentId" to document.path("documentId").scalarText(), "revisionId" to document.path("revisionId").scalarText(), "scopeRevisionId" to scope), authorization)
        return mapper.valueToTree(mapOf("targetType" to request.targetType, "targetId" to targetId, "documentId" to document.path("documentId"), "revisionId" to document.path("revisionId")))
    }

    /** Replace source keys in a private copy, resolving the version before the captured document revision. */
    private fun legacyMapping(payload: JsonNode, authorization: String?): JsonNode {
        val mapping = (payload as ObjectNode).deepCopy()
        mapping.remove("targetKey")?.scalarText()?.let { key -> mapping.put("versionId", dependency(key).path("versionId").scalarText()) }
        mapping.remove("documentKey")?.scalarText()?.let { key ->
            val document = dependency(key)
            mapping.set("documentId", document.path("documentId"))
            mapping.set("documentRevision", document.path("revision"))
        }
        return domains.legacyMapping(mapping, authorization)
    }

    /** Preserve column order and existing pins while resolving only object-valued staged column references. */
    private fun comparison(payload: JsonNode, authorization: String?): JsonNode {
        val definition = (payload as ObjectNode).deepCopy().put("attemptId", item.id.toString())
        definition.remove("sourceDocumentKey")?.scalarText()?.let { key ->
            val document = dependency(key)
            definition.set("sourceDocumentId", document.path("documentId"))
            definition.set("sourceDocumentRevision", document.path("revision"))
        }
        definition.path("columns").forEach { column ->
            if (column is ObjectNode) {
                column.remove("versionKey")?.scalarText()?.let { key ->
                    val snapshot = dependency(key)
                    column.set("versionId", snapshot.path("versionId"))
                    column.set("constitutionId", snapshot.path("constitutionId"))
                }
            }
        }
        val comparison = domains.comparison(definition, authorization)
        return mapper.valueToTree(mapOf("comparisonId" to comparison.path("id"), "status" to comparison.path("state")))
    }
}

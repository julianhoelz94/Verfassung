package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.CapturedDocumentPayload
import com.constitutionatlas.ingestion.api.CreateMigrationRun
import com.constitutionatlas.ingestion.api.DocumentRelationshipPayload
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.MigrationItem
import com.constitutionatlas.ingestion.api.MigrationRun
import com.constitutionatlas.ingestion.api.StageMigrationItem
import com.constitutionatlas.ingestion.client.MigrationDomainClient
import com.constitutionatlas.ingestion.repo.MigrationRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.scalarText
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.ObjectNode
import java.security.MessageDigest
import java.util.UUID

@Service
class MigrationService(private val repository: MigrationRepository, private val imports: ImportService, private val domains: MigrationDomainClient, private val mapper: ObjectMapper) {
    private fun staff(actor: Actor) = actor.roles.any { it in setOf("editor", "reviewer", "publisher", "admin") }
    private fun owned(id: UUID, actor: Actor, allowStaff: Boolean = true): UUID {
        if (!staff(actor) && "ingestion:import" !in actor.scopes) throw ForbiddenException("Migration access requires an import scope or staff role")
        val owner = repository.owner(id) ?: throw NotFoundException("Unknown migration run")
        if (owner != actor.id && !(allowStaff && staff(actor))) throw ForbiddenException("Migration run belongs to another principal")
        return owner
    }

    @Transactional
    fun create(actor: Actor, request: CreateMigrationRun): MigrationRun {
        require(request.runKey.length in 1..200 && request.title.length in 1..512 && request.sources.size in 1..100) { "Run requires a stable key, title and 1 to 100 source records" }
        require(request.sources.map { it.sourceKey }.distinct().size == request.sources.size) { "Source keys must be unique" }
        require(mapper.writeValueAsBytes(request).size <= 128 * 1024) { "Source inventory exceeds 128 KiB; split into bounded runs" }
        request.sources.forEach { source ->
            require(source.sourceKey.length in 1..200 && source.url.length <= 2048 && source.url.startsWith("https://")) { "Each source needs a stable key and HTTPS URL" }
            require(source.sha256 == null || source.sha256.matches(Regex("[a-f0-9]{64}"))) { "Invalid source hash" }
            require(source.targetKeys.size <= 100 && source.targetKeys.all { it.length in 1..200 }) { "Invalid source-to-target map" }
            require(source.aliases.size <= 20 && source.aliases.all { it.length <= 2048 && it.startsWith("https://") }) { "Invalid source aliases" }
            require(source.disposition in setOf("included", "unavailable", "excluded")) { "Invalid source disposition" }
            require(source.disposition == "included" || !source.reason.isNullOrBlank()) { "Unavailable and excluded sources require reasons" }
        }
        val hash = hash(mapper.valueToTree(request))
        repository.lock("migration:${actor.id}:${request.runKey}")
        val existing = repository.byKey(actor.id, request.runKey)
        val id = if (existing == null) {
            repository.create(actor.id, request, hash)
        } else {
            if (existing.second != hash) throw org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "Run key already identifies a different source inventory")
            existing.first
        }
        return get(id, actor)
    }

    fun list(actor: Actor): List<Map<String, Any>> = repository.list(actor.id, staff(actor)).map { id ->
        val run = get(id, actor)
        mapOf("id" to id, "title" to run.manifest.title, "ownerId" to run.ownerId, "coverage" to run.coverage)
    }

    fun get(id: UUID, actor: Actor): MigrationRun {
        val owner = owned(id, actor)
        val manifest = repository.manifest(id)
        val items = repository.items(id).map { item ->
            val jobId = item.result.path("jobId").scalarText().takeIf { it.isNotBlank() }?.let(UUID::fromString)
            val job = jobId?.let(imports::getJob)
            if (job != null && item.result.isObject) item.copy(result = (item.result as ObjectNode).deepCopy().put("status", job.status).also { value -> job.versionId?.let { value.put("versionId", it.toString()) } }) else item
        }
        return MigrationRun(
            id,
            owner,
            manifest,
            items,
            mapOf(
                "sources" to manifest.sources.size,
                "included" to manifest.sources.count { it.disposition == "included" },
                "unavailable" to manifest.sources.count { it.disposition == "unavailable" },
                "excluded" to manifest.sources.count { it.disposition == "excluded" },
                "staged" to items.size,
                "prepared" to items.count { it.state == "prepared" },
                "approved" to items.count { it.result.path("status").scalarText() == "approved" },
                "published" to items.count { it.result.path("status").scalarText() == "completed" },
                "blocked" to items.count { it.state in setOf("blocked", "failed") },
            ),
        )
    }

    @Transactional
    fun stage(run: UUID, actor: Actor, request: StageMigrationItem, authorization: String?): MigrationItem {
        owned(run, actor, allowStaff = false)
        require(request.sourceKey.length in 1..200 && request.dependencies.size <= 100 && request.dependencies.distinct().size == request.dependencies.size && request.sourceKey !in request.dependencies) { "Invalid source key or dependencies" }
        require(request.kind in setOf("snapshot", "document", "citation", "amendment", "document_link", "legacy_mapping", "comparison")) { "Unsupported migration resource kind" }
        require(request.payload.isObject && mapper.writeValueAsBytes(request).size <= 25 * 1024 * 1024) { "Migration item exceeds 25 MiB or is not an object" }
        val hash = hash(mapper.valueToTree(request))
        repository.lock("migration-run-items:$run")
        repository.items(run).firstOrNull { it.sourceKey == request.sourceKey }?.let {
            if (it.sha256 != hash) throw org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "Source key already identifies different content; preserve the existing item and use a new source identity")
            return it
        }
        if (repository.items(run).size >= 100) throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Run item limit is 100")
        if (request.kind == "snapshot") ImportValidator.requireConfirmedPinForScopedUpload(actor, mapper.treeToValue(request.payload, ImportRequest::class.java))
        if (request.kind in setOf("document", "citation")) {
            val capture = mapper.treeToValue(request.payload, CapturedDocumentPayload::class.java)
            val source = repository.manifest(run).sources.firstOrNull { it.captureKey == request.sourceKey || it.sourceKey == request.sourceKey }
            require(source?.sha256 == null || capture.fileSha256 == source.sha256) { "Capture hash differs from the source inventory" }
        }
        if (request.kind == "document_link") mapper.treeToValue(request.payload, DocumentRelationshipPayload::class.java)
        if (request.kind == "amendment") validateMigrationAmendment(request.payload)
        val id = repository.insert(run, request, hash)
        if (request.kind == "snapshot") {
            val job = imports.importVersion(authorization, actor.id, mapper.treeToValue(request.payload, ImportRequest::class.java), idempotencyKey = "migration-$id")
            repository.finish(id, "staged", mapper.valueToTree(mapOf("jobId" to job.id)), job.errors.takeIf { it.isNotEmpty() }?.joinToString { it.message })
        }
        return repository.items(run).first { it.id == id }
    }

    fun prepare(run: UUID, itemId: UUID, actor: Actor, authorization: String?): MigrationItem {
        owned(run, actor)
        if (actor.roles.none { it == "editor" || it == "admin" }) throw ForbiddenException("Preparing migration resources requires an editor")
        val items = repository.items(run)
        val item = items.firstOrNull { it.id == itemId } ?: throw NotFoundException("Migration item does not belong to this run")
        if (item.state == "prepared") return item
        val missing = item.dependencies.filter { key -> items.none { it.sourceKey == key && it.state == "prepared" } }
        if (missing.isNotEmpty()) {
            repository.block(itemId, "Unresolved dependencies: ${missing.joinToString()}")
            return repository.items(run).first { it.id == itemId }
        }
        val attempt = repository.claim(itemId, actor.id) ?: throw org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "Resource preparation is already running; reload before retrying")
        try {
            val payload = repository.payload(itemId)
            fun dependency(key: String): JsonNode {
                require(key in item.dependencies) { "Relationship target must be an explicit dependency" }
                return items.firstOrNull { it.sourceKey == key && it.state == "prepared" }?.result ?: throw org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "Relationship target is unresolved")
            }
            val result: JsonNode = when (item.kind) {
                "snapshot" -> {
                    val jobId = UUID.fromString(item.result.path("jobId").scalarText())
                    var job = imports.getJob(jobId) ?: throw NotFoundException("Staged snapshot job is missing")
                    if (job.versionId == null || job.status == "failed") job = imports.prepare(authorization, jobId, actor.id)
                    if (job.versionId == null || job.status == "failed") throw org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "Snapshot preparation failed: ${job.errors.joinToString { it.message }}")
                    val request = mapper.treeToValue(payload, ImportRequest::class.java)
                    mapper.valueToTree(mapOf("jobId" to job.id, "versionId" to job.versionId, "constitutionId" to request.constitutionId, "status" to job.status))
                }
                "document", "citation" -> {
                    val request = (payload as ObjectNode).deepCopy().put("attemptId", itemId.toString())
                    val document = domains.capture(request, authorization)
                    mapper.valueToTree(mapOf("documentId" to document.path("id"), "revisionId" to document.path("revision").path("id"), "revision" to document.path("revision").path("revision"), "fileSha256" to payload.path("fileSha256")))
                }
                "amendment" -> {
                    val constitution = UUID.fromString(payload.path("constitutionId").scalarText())
                    val record = (payload.path("record") as ObjectNode).deepCopy().put("publishAttemptId", itemId.toString())
                    val amendment = domains.amendment(constitution, record, authorization)
                    require(!amendment.path("revisionId").isMissingNode && !amendment.path("revisionId").isNull) { "Prepared amendment has no revision pin" }
                    mapper.valueToTree(mapOf("amendmentId" to amendment.path("id"), "scopeRevisionId" to amendment.path("revisionId"), "status" to amendment.path("status")))
                }
                "document_link" -> {
                    val request = mapper.treeToValue(payload, DocumentRelationshipPayload::class.java)
                    require(request.targetType in setOf("constitution", "version", "amendment")) { "Unsupported relationship target" }
                    val document = dependency(request.documentKey)
                    val target = dependency(request.targetKey)
                    val targetId = UUID.fromString(target.path("${request.targetType}Id").scalarText())
                    val scope = if (request.targetType == "amendment") target.path("scopeRevisionId").scalarText().also { UUID.fromString(it) } else null
                    domains.documentLink(request.targetType, targetId, mapOf("documentId" to document.path("documentId").scalarText(), "revisionId" to document.path("revisionId").scalarText(), "scopeRevisionId" to scope), authorization)
                    mapper.valueToTree(mapOf("targetType" to request.targetType, "targetId" to targetId, "documentId" to document.path("documentId"), "revisionId" to document.path("revisionId")))
                }
                "legacy_mapping" -> {
                    val mapping = (payload as ObjectNode).deepCopy()
                    mapping.remove("targetKey")?.scalarText()?.let { key -> mapping.put("versionId", dependency(key).path("versionId").scalarText()) }
                    mapping.remove("documentKey")?.scalarText()?.let { key ->
                        val document = dependency(key)
                        mapping.set("documentId", document.path("documentId"))
                        mapping.set("documentRevision", document.path("revision"))
                    }
                    domains.legacyMapping(mapping, authorization)
                }
                "comparison" -> {
                    val definition = (payload as ObjectNode).deepCopy().put("attemptId", itemId.toString())
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
                    mapper.valueToTree(mapOf("comparisonId" to comparison.path("id"), "status" to comparison.path("state")))
                }
                else -> throw IllegalArgumentException("Unsupported resource kind")
            }
            repository.finishAttempt(itemId, attempt, "prepared", result)
            if (item.kind in setOf("document", "citation")) repository.scrubCapture(itemId)
        } catch (ex: RuntimeException) {
            repository.finishAttempt(itemId, attempt, "failed", item.result, (ex.message ?: "Resource preparation failed").take(2000))
        }
        return repository.items(run).first { it.id == itemId }
    }

    fun attempts(run: UUID, item: UUID, actor: Actor, offset: Int, limit: Int): com.constitutionatlas.ingestion.api.MigrationAttemptPage {
        owned(run, actor)
        if (repository.items(run).none { it.id == item }) throw NotFoundException("Migration item does not belong to this run")
        require(offset >= 0 && limit in 1..50) { "Invalid attempt page" }
        return repository.attempts(item, offset, limit)
    }

    private fun hash(node: JsonNode): String {
        fun canonical(value: JsonNode): JsonNode = when {
            value.isObject -> mapper.createObjectNode().also { target -> value.propertyNames().asSequence().sorted().forEach { key -> target.set(key, canonical(value.path(key))) } }
            value.isArray -> mapper.createArrayNode().also { target -> value.forEach { target.add(canonical(it)) } }
            else -> value
        }
        return MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(canonical(node))).joinToString("") { "%02x".format(it) }
    }
}

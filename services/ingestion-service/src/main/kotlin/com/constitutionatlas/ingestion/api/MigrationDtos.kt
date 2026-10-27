package com.constitutionatlas.ingestion.api

import com.constitutionatlas.platform.StrictOrderedWrite
import tools.jackson.databind.JsonNode
import java.util.UUID

data class MigrationSource(
    val sourceKey: String,
    val url: String,
    val sha256: String? = null,
    val encoding: String? = null,
    val attribution: String? = null,
    val aliases: List<String> = emptyList(),
    val disposition: String = "included",
    val reason: String? = null,
    val captureKey: String? = null,
    @get:com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_EMPTY)
    val targetKeys: List<String> = emptyList(),
) : StrictOrderedWrite()
data class CreateMigrationRun(val runKey: String, val title: String, val sources: List<MigrationSource>) : StrictOrderedWrite()
data class StageMigrationItem(val sourceKey: String, val kind: String, val dependencies: List<String> = emptyList(), val payload: JsonNode) : StrictOrderedWrite()
data class MigrationUploadEnvelope(val migrationRunId: UUID, val item: StageMigrationItem) : StrictOrderedWrite()
data class MigrationItem(
    val id: UUID,
    val sourceKey: String,
    val kind: String,
    val sha256: String,
    val dependencies: List<String>,
    val state: String,
    val result: JsonNode,
    val attempts: Int,
    val error: String?,
)
data class MigrationRun(
    val id: UUID,
    val ownerId: UUID,
    val manifest: CreateMigrationRun,
    val items: List<MigrationItem>,
    val coverage: Map<String, Int>,
)
data class MigrationAttempt(val number: Int, val actorId: UUID, val state: String, val error: String?, val startedAt: java.time.OffsetDateTime, val finishedAt: java.time.OffsetDateTime?)
data class MigrationAttemptPage(val items: List<MigrationAttempt>, val nextOffset: Int?)
data class CapturedDocumentPayload(
    val title: String,
    val description: String? = null,
    val sourceUrl: String? = null,
    val fileName: String? = null,
    val fileBase64: String? = null,
    val fileSha256: String? = null,
) : StrictOrderedWrite()
data class DocumentRelationshipPayload(val documentKey: String, val targetKey: String, val targetType: String) : StrictOrderedWrite()

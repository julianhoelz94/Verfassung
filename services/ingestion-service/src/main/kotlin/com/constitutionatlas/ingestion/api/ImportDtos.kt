package com.constitutionatlas.ingestion.api

import com.constitutionatlas.platform.OrderedNodeWrite
import java.time.LocalDate
import java.util.UUID

data class ImportNode(
    val kind: String,
    val label: String? = null,
    val title: String? = null,
    val body: String? = null,
    val children: List<ImportNode> = emptyList(),
)

data class ImportArticle(
    val articleNumber: String,
    val title: String,
    val body: String = "",
    val sortOrder: Int,
    val nodes: List<ImportNode> = emptyList(),
)

data class ImportOutlineKind(
    val kindCode: String,
    val displayLabel: String,
    val presentation: String = "section",
    val showLabel: Boolean = true,
    val showTitle: Boolean = false,
    val showKind: Boolean = false,
    val allowTextAlongsideChildren: Boolean = false,
    val titlePolicy: String = "optional",
    val labelPolicy: String = "optional",
    val labelPlacement: String = "before_title",
    val segmentation: String = "plain",
)

data class ImportOutline(
    val kinds: List<ImportOutlineKind> = emptyList(),
)

data class ImportRequest(
    val isoCode: String,
    val countryName: String,
    val constitutionSlug: String,
    val constitutionTitle: String,
    val versionLabel: String,
    val effectiveDate: LocalDate? = null,
    val languageCode: String = "en",
    val sourceUrl: String? = null,
    val gazetteReference: String? = null,
    val predecessorVersionId: UUID? = null,
    val hopKind: String? = null,
    val constitutionId: UUID? = null,
    val settingsRevisionId: UUID? = null,
    val outline: ImportOutline? = null,
    val articles: List<ImportArticle> = emptyList(),
    val roots: List<OrderedNodeWrite> = emptyList(),
)

data class ImportErrorDto(
    val code: String,
    val message: String,
)

data class ImportJobDto(
    val id: UUID,
    val status: String,
    val versionId: UUID?,
    val errors: List<ImportErrorDto>,
    val isoCode: String? = null,
    val submittedBy: UUID? = null,
    val preparedBy: UUID? = null,
    val approvedBy: UUID? = null,
    val publishedBy: UUID? = null,
    val outlineConfirmedBy: UUID? = null,
)

data class ImportBatchDto(val id: UUID, val items: List<ImportJobDto>, val status: String)

data class StageBatchItemRequest(val idempotencyKey: String, val payload: ImportRequest, val checksumSha256: String? = null)

data class ReviewDecisionRequest(val reason: String)

data class ReviewDecisionDto(val id: UUID, val decision: String, val reason: String, val decidedBy: UUID, val decidedAt: java.time.OffsetDateTime)

data class SetupProposalRequest(
    val isoCode: String,
    val countryName: String,
    val constitutionSlug: String,
    val constitutionTitle: String,
    val languageCode: String = "en",
    val sourceUrl: String? = null,
    val gazetteReference: String? = null,
    val outline: ImportOutline,
    val sampleRoots: List<OrderedNodeWrite> = emptyList(),
)

data class SetupProposalDto(
    val id: UUID,
    val ownerId: UUID,
    val status: String,
    val payload: SetupProposalRequest,
    val constitutionId: UUID?,
    val settingsRevisionId: UUID?,
    val confirmedBy: UUID?,
)

data class BeginUploadRequest(val idempotencyKey: String, val checksumSha256: String, val totalBytes: Int)
data class UploadChunkRequest(val dataBase64: String, val checksumSha256: String)
data class ImportUploadDto(val id: UUID, val batchId: UUID, val status: String, val totalBytes: Int, val chunkBytes: Int, val missingChunks: List<Int>, val itemId: UUID?)

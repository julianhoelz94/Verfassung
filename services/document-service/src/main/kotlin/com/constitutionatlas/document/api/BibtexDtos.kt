package com.constitutionatlas.document.api

import java.util.UUID

data class BibtexPreviewRequest(val content: String, val folderId: UUID? = null)

data class BibtexPreviewDto(val entries: List<BibtexPreviewEntryDto>, val warnings: List<String>)

data class BibtexPreviewEntryDto(
    val index: Int,
    val citationKey: String,
    val title: String,
    val bibliography: BibliographyDto,
    val sourceUrl: String?,
    val description: String?,
    val conflictDocumentId: UUID?,
    val duplicateCandidates: List<DocumentDto>,
    val warnings: List<String>,
)

data class BibtexImportRequest(
    val operationId: String,
    val content: String,
    val folderId: UUID? = null,
    val decisions: List<BibtexImportDecision>,
)

data class BibtexImportDecision(
    val index: Int,
    val action: String,
    val citationKey: String? = null,
    val documentId: UUID? = null,
    val expectedRevision: Int? = null,
)

data class BibtexImportDto(val documents: List<DocumentDto>, val skipped: Int)

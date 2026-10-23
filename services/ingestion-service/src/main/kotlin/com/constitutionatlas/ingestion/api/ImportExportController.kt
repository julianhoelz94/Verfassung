package com.constitutionatlas.ingestion.api

import com.constitutionatlas.ingestion.client.WriteAccess
import com.constitutionatlas.ingestion.service.ImportExportService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class ImportExportController(private val exports: ImportExportService, private val access: WriteAccess) {
    @GetMapping("/import-jobs/{id}/export")
    fun export(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: UUID,
        @RequestParam(defaultValue = "prepared") view: String,
        @RequestParam(required = false) cursor: String?,
    ): ImportExportPage = exports.export(id, access.authenticate(authorization), view, cursor, authorization)
}

data class ExportValue(val path: String, val value: com.fasterxml.jackson.databind.JsonNode)
data class FidelityMismatch(val path: String, val reason: String)
data class ImportExportPage(
    val jobId: UUID,
    val view: String,
    val snapshotId: String,
    val versionId: UUID?,
    val generation: Long?,
    val settingsRevisionId: UUID?,
    val source: Map<String, Any?>,
    val records: List<ExportValue>,
    val totalRecords: Int,
    val nextCursor: String?,
    val complete: Boolean,
    val fidelity: List<FidelityMismatch>,
    val fidelityComplete: Boolean,
    val validationErrors: List<ImportErrorDto>,
    val counts: Map<String, Int> = emptyMap(),
    val resourcesComplete: Boolean = false,
)

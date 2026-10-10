package com.constitutionatlas.ingestion.api

import com.constitutionatlas.ingestion.client.WriteAccess
import com.constitutionatlas.ingestion.service.ImportService
import com.constitutionatlas.ingestion.service.ImportValidator
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class ImportController(
    private val importService: ImportService,
    private val writeAccess: WriteAccess,
) {
    @PostMapping("/import-jobs")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestHeader(value = "Idempotency-Key", required = false) idempotencyKey: String?,
        @RequestBody request: ImportRequest,
    ): ImportJobDto {
        val actor = writeAccess.requireImporter(authorization)
        ImportValidator.requireConfirmedPinForScopedUpload(actor, request)
        return importService.importVersion(authorization, actor.id, request, idempotencyKey = idempotencyKey)
    }

    @GetMapping("/import-jobs/{jobId}")
    fun get(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable jobId: UUID,
    ): ImportJobDto {
        val actor = writeAccess.authenticate(authorization)
        val job = importService.getJob(jobId) ?: throw NotFoundException("Unknown import job '$jobId'")
        if (actor.id != job.submittedBy && actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") }) {
            throw ForbiddenException("Import job access requires ownership or staff role")
        }
        return job
    }

    @GetMapping("/import-jobs")
    fun list(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(required = false) status: String?,
    ): List<ImportJobDto> {
        writeAccess.requireStaff(authorization)
        return importService.listJobs(status)
    }

    @GetMapping("/import-jobs/{jobId}/payload")
    fun payload(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable jobId: UUID,
    ): ImportRequest {
        writeAccess.requireStaff(authorization)
        return importService.stagedRequest(jobId) ?: throw NotFoundException("Unknown import job '$jobId'")
    }

    @PostMapping("/import-jobs/{jobId}/prepare")
    fun prepare(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable jobId: UUID): ImportJobDto =
        importService.prepare(authorization, jobId, writeAccess.requireEditor(authorization).id)

    @PostMapping("/import-jobs/{jobId}/confirm-outline")
    fun confirmOutline(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable jobId: UUID): ImportJobDto =
        importService.confirmOutline(authorization, jobId, writeAccess.requireEditor(authorization).id)

    @PostMapping("/import-jobs/{jobId}/approve")
    fun approve(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable jobId: UUID, @RequestBody request: ReviewDecisionRequest): ImportJobDto =
        importService.approve(authorization, jobId, writeAccess.requireReviewer(authorization).id, request.reason)

    @PostMapping("/import-jobs/{jobId}/reject")
    fun reject(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable jobId: UUID, @RequestBody request: ReviewDecisionRequest): ImportJobDto =
        importService.reject(jobId, writeAccess.requireReviewer(authorization).id, request.reason)

    @GetMapping("/import-jobs/{jobId}/decisions")
    fun reviewDecisions(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable jobId: UUID): List<ReviewDecisionDto> {
        writeAccess.requireStaff(authorization)
        if (importService.getJob(jobId) == null) throw NotFoundException("Unknown import job '$jobId'")
        return importService.reviewDecisions(jobId)
    }

    @PostMapping("/import-jobs/{jobId}/publish")
    fun publish(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable jobId: UUID): ImportJobDto =
        importService.publish(authorization, jobId, writeAccess.requirePublisher(authorization).id)
}

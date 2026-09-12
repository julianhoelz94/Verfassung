package com.constitutionatlas.amendment.api

import com.constitutionatlas.amendment.GoneException
import com.constitutionatlas.amendment.client.WriteAccess
import com.constitutionatlas.amendment.service.AmendmentService
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

// Callers: HTTP via Caddy /api/amendment. Unique REST controller for amendment-service.
// API: GET ?reviewStatus=needs_review; POST .../refresh-review-status. User: "Work on Sprint 36"
@RestController
class AmendmentController(
    private val amendmentService: AmendmentService,
    private val writeAccess: WriteAccess,
) {
    @GetMapping("/constitutions/{constitutionId}/amendments")
    fun listForConstitution(
        @PathVariable constitutionId: UUID,
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) reviewStatus: String?,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<AmendmentDto> {
        val statusFilter = status?.trim()?.ifBlank { null }
        val reviewFilter = reviewStatus?.trim()?.ifBlank { null }
        if (reviewFilter != null) {
            if (reviewFilter != "ok" && reviewFilter != "needs_review") {
                throw IllegalArgumentException("reviewStatus must be ok or needs_review")
            }
            val staffStatus = when (statusFilter) {
                null, "all" -> null
                "published" -> "published"
                else -> throw IllegalArgumentException("status must be published or all")
            }
            writeAccess.requireStaffAmendment(authorization)
            return amendmentService.listStaffForConstitution(constitutionId, staffStatus, reviewFilter)
        }
        if (statusFilter == null || statusFilter == "published") {
            return amendmentService.listForConstitution(constitutionId)
        }
        if (statusFilter != "all") {
            throw IllegalArgumentException("status must be published or all")
        }
        writeAccess.requireStaffAmendment(authorization)
        return amendmentService.listStaffForConstitution(constitutionId)
    }

    @GetMapping("/amendments/{id}")
    fun getAmendment(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): AmendmentDto {
        if (writeAccess.staffActorOrNull(authorization) != null) {
            return amendmentService.getStaffAmendment(id)
        }
        return amendmentService.getPublishedAmendment(id)
    }

    @GetMapping("/amendments/{id}/revisions")
    fun listRevisions(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): List<AmendmentRevisionDto> {
        writeAccess.requireStaffAmendment(authorization)
        return amendmentService.listRevisions(id)
    }

    @GetMapping("/versions/{versionId}/amendments")
    fun listForVersion(
        @PathVariable versionId: UUID,
        @RequestParam(required = false) sourceVersionId: UUID?,
    ): List<AmendmentDto> = amendmentService.listForVersion(versionId, sourceVersionId)

    @GetMapping("/amendments")
    fun listForArticle(
        @RequestParam constitutionId: UUID,
        @RequestParam articleNumber: String,
    ): List<AmendmentDto> = amendmentService.listForArticle(constitutionId, articleNumber)

    @PostMapping("/constitutions/{constitutionId}/amendments")
    @ResponseStatus(HttpStatus.CREATED)
    fun createAmendment(
        @PathVariable constitutionId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: AmendmentWriteRequest,
    ): AmendmentDto {
        val actor = writeAccess.requireAmendmentDraftWriter(authorization)
        return amendmentService.createAmendment(constitutionId, request, actor)
    }

    @PostMapping("/constitutions/{constitutionId}/amendments/refresh-review-status")
    fun refreshReviewStatus(
        @PathVariable constitutionId: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: RefreshReviewStatusRequest,
    ): RefreshReviewStatusResponse {
        writeAccess.requireAmendmentReviewRefresh(authorization)
        return amendmentService.refreshReviewStatus(constitutionId, request.legalVersionId)
    }

    @PostMapping("/amendments/{id}/revisions")
    fun appendRevision(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: AmendmentWriteRequest,
    ): AmendmentDto {
        val actor = writeAccess.requireAmendmentDraftWriter(authorization)
        return amendmentService.appendRevision(id, request, actor)
    }

    @PostMapping("/amendments/{id}/publish")
    fun publishAmendment(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): AmendmentDto {
        writeAccess.requireAmendmentPublisher(authorization)
        return amendmentService.publishAmendment(id)
    }

    @PostMapping("/amendments/{id}/withdraw")
    fun withdrawAmendment(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
    ): AmendmentDto {
        writeAccess.requireAmendmentPublisher(authorization)
        return amendmentService.withdrawAmendment(id)
    }

    @PostMapping("/amendments/{id}/link-target")
    fun linkTarget(
        @PathVariable id: UUID,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: LinkTargetRequest,
    ): AmendmentDto {
        val actor = writeAccess.requireAmendmentLinker(authorization)
        return amendmentService.linkTarget(id, request, actor)
    }

    @PostMapping("/amendments/suggest")
    fun suggest(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: SuggestRequest,
    ): SuggestResponse {
        writeAccess.requireAmendmentWriter(authorization)
        return amendmentService.suggest(request)
    }

    /**
     * Removed in ED-6. Use the amendment write API.
     */
    @PostMapping("/transitions")
    fun recordTransition(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: TransitionRequest,
    ): AmendmentDto {
        writeAccess.requireAmendmentWriter(authorization)
        throw GoneException("use the amendment write API")
    }
}

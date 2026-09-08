package com.constitutionatlas.amendment.api

import com.constitutionatlas.amendment.client.WriteAccess
import com.constitutionatlas.amendment.service.AmendmentService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class AmendmentController(
    private val amendmentService: AmendmentService,
    private val writeAccess: WriteAccess,
) {
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

    @PostMapping("/transitions")
    fun recordTransition(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: TransitionRequest,
    ): AmendmentDto {
        writeAccess.requireAmendmentWriter(authorization)
        return amendmentService.recordTransition(request)
    }
}

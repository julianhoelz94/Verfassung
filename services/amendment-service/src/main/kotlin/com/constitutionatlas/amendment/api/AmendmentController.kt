package com.constitutionatlas.amendment.api

import com.constitutionatlas.amendment.repo.AmendmentRepository
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class AmendmentController(private val amendmentRepository: AmendmentRepository) {
    @GetMapping("/versions/{versionId}/amendments")
    fun listForVersion(
        @PathVariable versionId: UUID,
        @RequestParam(required = false) sourceVersionId: UUID?,
    ): List<AmendmentDto> =
        amendmentRepository.listForTargetVersion(versionId, sourceVersionId)
}

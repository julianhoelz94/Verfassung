package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.client.AmendmentClient
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class AmendmentActions(private val amendmentClient: AmendmentClient) {
    fun completeLink(amendmentId: UUID, sourceVersionId: UUID, targetVersionId: UUID, authorization: String?) {
        val record = amendmentClient.getAmendment(amendmentId, authorization)
            ?: throw DownstreamException("change record missing after version publish")
        if (record.targetVersionId != targetVersionId) {
            amendmentClient.linkTarget(amendmentId, sourceVersionId, targetVersionId, authorization)
        }
        if (record.status != "published" || record.targetVersionId != targetVersionId) {
            amendmentClient.publishAmendment(amendmentId, authorization)
        }
    }

    fun refresh(constitutionId: UUID, legalVersionId: UUID, authorization: String?) {
        amendmentClient.refreshReviewStatus(constitutionId, legalVersionId, authorization)
    }
}

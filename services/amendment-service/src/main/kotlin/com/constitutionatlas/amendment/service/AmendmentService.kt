package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.TransitionRequest
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.repo.AmendmentChangeInsert
import com.constitutionatlas.amendment.repo.AmendmentInsert
import com.constitutionatlas.amendment.repo.AmendmentRepository
import com.constitutionatlas.amendment.repo.TransitionInsert
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class AmendmentService(
    private val amendmentRepository: AmendmentRepository,
    private val contentClient: ContentClient,
    private val catalogClient: CatalogClient,
) {
    fun listForVersion(versionId: UUID, sourceVersionId: UUID?): List<AmendmentDto> =
        amendmentRepository.listForTargetVersion(versionId, sourceVersionId)

    fun listForArticle(constitutionId: UUID, articleNumber: String): List<AmendmentDto> =
        amendmentRepository.listForArticle(constitutionId, articleNumber)

    @Transactional
    fun recordTransition(request: TransitionRequest): AmendmentDto {
        if (request.sourceVersionId == request.targetVersionId) {
            throw IllegalArgumentException("sourceVersionId and targetVersionId must differ")
        }
        if (amendmentRepository.transitionExists(request.sourceVersionId, request.targetVersionId)) {
            throw ConflictException("transition already exists")
        }
        val sourceTree = contentClient.listArticles(request.sourceVersionId)
        val targetTree = contentClient.listArticles(request.targetVersionId)
        val changes = AmendmentDiff.diff(AmendmentDiff.flatten(sourceTree), AmendmentDiff.flatten(targetTree))
        val added = changes.count { it.type == "added" }
        val changed = changes.count { it.type == "changed" }
        val removed = changes.count { it.type == "removed" }
        val transitionId = UUID.randomUUID()
        val amendmentId = UUID.randomUUID()
        val constitutionId = catalogClient.getVersion(request.targetVersionId)?.constitutionId
        amendmentRepository.insertTransition(
            TransitionInsert(
                id = transitionId,
                sourceVersionId = request.sourceVersionId,
                targetVersionId = request.targetVersionId,
                constitutionId = constitutionId,
            ),
        )
        amendmentRepository.insertAmendment(
            AmendmentInsert(
                id = amendmentId,
                versionTransitionId = transitionId,
                title = request.amendingLawTitle?.trim()?.ifBlank { null } ?: "Computed transition",
                summary = "$added added, $changed changed, $removed removed",
                enactedOn = request.changedOn,
                sourceReference = request.amendingLawCitation?.trim()?.ifBlank { null },
            ),
        )
        changes.forEach { change ->
            val node = change.node
            amendmentRepository.insertChange(
                AmendmentChangeInsert(
                    id = UUID.randomUUID(),
                    amendmentId = amendmentId,
                    articleId = node.articleId,
                    articleNumber = node.articleNumber,
                    changeType = change.type,
                    note = noteFor(change),
                    nodeId = node.id,
                    changedOn = request.changedOn,
                    effectiveOn = request.effectiveOn,
                    amendingLawTitle = request.amendingLawTitle?.trim()?.ifBlank { null },
                    amendingLawCitation = request.amendingLawCitation?.trim()?.ifBlank { null },
                ),
            )
        }
        return amendmentRepository.listForTargetVersion(request.targetVersionId, request.sourceVersionId).first()
    }

    private fun noteFor(change: NodeChange): String {
        val label = change.node.number ?: change.node.label ?: change.node.kind
        return when (change.type) {
            "added" -> "Added $label"
            "removed" -> "Removed $label"
            else -> "Title or body changed on $label"
        }
    }
}

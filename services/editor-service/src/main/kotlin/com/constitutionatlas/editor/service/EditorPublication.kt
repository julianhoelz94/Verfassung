package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.PublishRequest
import com.constitutionatlas.editor.client.AmendmentClient
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.CatalogClient
import com.constitutionatlas.editor.client.ContentClient
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.SourceEvidenceRepository
import com.constitutionatlas.editor.repo.StructuredPublishJobRepository
import com.constitutionatlas.platform.Actor
import org.slf4j.Logger

/** Publication phases execute synchronously inside EditorService.publish's existing transaction. */
internal class EditorPublication(private val editorRepository: EditorRepository, private val structuredPublication: StructuredPublicationService, private val structuredPublishJobs: StructuredPublishJobRepository, private val structuredDiffReview: StructuredDiffReviewService, sourceEvidence: SourceEvidenceRepository, private val catalogClient: CatalogClient, contentClient: ContentClient, amendmentClient: AmendmentClient, amendmentActions: AmendmentActions, auditClient: AuditClient, log: Logger) {
    private val requests = EditorPublicationRequest(editorRepository, sourceEvidence)
    private val content = EditorPublicationContent(catalogClient, contentClient, structuredPublication, sourceEvidence)
    private val amendments = EditorPublicationAmendment(amendmentClient, editorRepository, structuredPublishJobs)
    private val delivery = EditorPublicationDelivery(editorRepository, sourceEvidence, amendmentActions, auditClient, log)

    /** Preparation and reservation precede request validation; pins precede source reads and writes. */
    fun publish(authorization: String?, session: EditSessionDto, request: PublishRequest, actor: Actor, structured: Boolean) {
        val sessionId = session.id
        val structuredPreview = if (structured) structuredPublication.prepare(sessionId, session.versionId) else null
        if (structuredPreview != null && session.hopKind == "legal") structuredDiffReview.requireComplete(structuredPreview)
        val reservation = if (structured) structuredPublication.reservation(sessionId, authorization) else null
        val drafts = editorRepository.listLatestDrafts(session.id)
        if (drafts.isEmpty() && !structured) throw IllegalArgumentException("No draft article changes to publish")
        val (hopKind, comment, changeRecord) = requests.resolve(session, request, structured)
        if (structured) structuredPublishJobs.pin(session.id, request)
        val (source, legalId) = content.source(session, structured, hopKind, reservation)
        val (sourceTree, changedArticles) = content.articles(session, structured, structuredPreview, drafts)
        val amendment = amendments.resolve(session, request, structured, hopKind, source, changeRecord, changedArticles, authorization)
        val (successor, mapping) = content.write(session, structuredPreview, source, hopKind, comment, authorization, sourceTree, changedArticles, drafts)
        val published = catalogClient.publishVersion(successor.id)
        delivery.complete(actor, session, source, published, structured, structuredPreview, hopKind, comment, amendment, legalId, mapping, drafts, authorization)
    }
}

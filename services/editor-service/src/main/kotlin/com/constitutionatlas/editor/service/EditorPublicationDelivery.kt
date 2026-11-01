package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.DraftArticleDto
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.EditSessionStatus
import com.constitutionatlas.editor.api.StructuredDraftPreview
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.CatalogVersion
import com.constitutionatlas.editor.client.LinkedAmendment
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.SourceEvidenceRepository
import com.constitutionatlas.platform.Actor
import org.slf4j.Logger
import java.time.Instant
import java.util.UUID

/** Durable link/refresh delivery and publication bookkeeping remain in the caller's transaction. */
internal class EditorPublicationDelivery(private val editorRepository: EditorRepository, private val sourceEvidence: SourceEvidenceRepository, private val amendmentActions: AmendmentActions, private val auditClient: AuditClient, private val log: Logger) {
    /** Link/refresh failures queue retries; final status, source decision, outbox and audit retain their order. */
    fun complete(actor: Actor, session: EditSessionDto, source: CatalogVersion, published: CatalogVersion, structured: Boolean, structuredPreview: StructuredDraftPreview?, hopKind: String, comment: String?, amendment: LinkedAmendment?, legalId: UUID, orderedMapping: Map<String, String>, drafts: List<DraftArticleDto>, authorization: String?) {
        val sessionId = session.id
        if (amendment != null) link(session, published, structured, amendment, authorization) else refresh(session, source, legalId, authorization)
        if (hopKind == "editorial_correction") {
            editorRepository.recordPublishComment(session.id, comment!!)
        }
        editorRepository.updateStatus(session.id, EditSessionStatus.PUBLISHED)
        sourceEvidence.recordDecision(sessionId, "version_published", actor.id, actor.email)
        editorRepository.insertOutboxEvent(
            session.id,
            DomainEvents.VERSION_PUBLISHED,
            mapOf(
                "sourceVersionId" to session.versionId,
                "newVersionId" to published.id,
                "unitMapping" to orderedMapping,
                "sourceGeneration" to structuredPreview?.sourceGeneration,
                "settingsRevisionId" to structuredPreview?.settingsRevisionId,
                "constitutionId" to source.constitutionId,
                "actorId" to actor.id,
                "versionLabel" to published.versionLabel,
                "hopKind" to hopKind,
            ),
            publishedAt = Instant.now(),
        )
        editorRepository.insertOutboxEvent(
            session.id,
            DomainEvents.SEARCH_REINDEX_REQUESTED,
            mapOf("versionId" to published.id),
        )
        auditClient.record(
            actor,
            "version_published",
            "edit_session",
            session.id,
            mapOf(
                "sourceVersionId" to session.versionId,
                "newVersionId" to published.id,
                "articleIds" to drafts.map { it.articleId },
                "hopKind" to hopKind,
            ),
        )
    }

    /** Runtime linkage failures are recorded without cancelling a successfully published successor. */
    private fun link(session: EditSessionDto, published: CatalogVersion, structured: Boolean, amendment: LinkedAmendment, authorization: String?) {
        val payload = mapOf(
            "amendmentId" to amendment.id,
            "sourceVersionId" to session.versionId,
            "targetVersionId" to published.id,
        )
        val eventId = editorRepository.insertOutboxEvent(session.id, DomainEvents.AMENDMENT_LINK_REQUESTED, payload)
        try {
            amendmentActions.completeLink(amendment.id, session.versionId, published.id, authorization, if (structured) session.id else null)
            editorRepository.markOutboxPublished(eventId)
            editorRepository.insertOutboxEvent(
                session.id,
                DomainEvents.AMENDMENT_RECORDED,
                payload,
                publishedAt = Instant.now(),
            )
        } catch (ex: RuntimeException) {
            log.warn("change record {} linkage queued for retry: {}", amendment.id, ex.message)
            editorRepository.markOutboxFailed(eventId, ex.message ?: ex.javaClass.simpleName)
        }
    }

    /** Editorial corrections retry review refresh through the outbox after transient failures. */
    private fun refresh(session: EditSessionDto, source: CatalogVersion, legalId: UUID, authorization: String?) {
        val eventId = editorRepository.insertOutboxEvent(
            session.id,
            DomainEvents.REVIEW_STATUS_REFRESH_REQUESTED,
            mapOf("constitutionId" to source.constitutionId, "legalVersionId" to legalId),
        )
        try {
            amendmentActions.refresh(source.constitutionId, legalId, authorization)
            editorRepository.markOutboxPublished(eventId)
        } catch (ex: RuntimeException) {
            log.warn("review status refresh queued for retry: {}", ex.message)
            editorRepository.markOutboxFailed(eventId, ex.message ?: ex.javaClass.simpleName)
        }
    }
}

package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.client.SearchIndexClient
import com.constitutionatlas.editor.repo.EditorRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

@Component
class OutboxPublisher(
    private val editorRepository: EditorRepository,
    private val searchIndexClient: SearchIndexClient,
    private val amendmentActions: AmendmentActions,
    @Value("\${editor.downstream.bearer:}") private val serviceToken: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${editor.outbox.poll-ms:5000}")
    @Transactional
    fun processDue() {
        editorRepository.claimUnpublishedSearchReindex(BATCH_SIZE).forEach { id ->
            try {
                searchIndexClient.reindex()
                editorRepository.markOutboxPublished(id)
            } catch (ex: RuntimeException) {
                log.warn("search reindex outbox {} failed: {}", id, ex.message)
                editorRepository.markOutboxFailed(id, ex.message ?: ex.javaClass.simpleName)
            }
        }
        editorRepository.claimUnpublishedAmendmentActions(BATCH_SIZE).forEach { event ->
            try {
                val authorization = serviceToken.trim().takeIf { it.isNotEmpty() }
                    ?.let { "Bearer $it" }
                    ?: throw IllegalStateException("editor downstream bearer is required for amendment retries")
                when (event.eventName) {
                    DomainEvents.AMENDMENT_LINK_REQUESTED -> {
                        val amendmentId = UUID.fromString(event.payload.path("amendmentId").asText())
                        val sourceId = UUID.fromString(event.payload.path("sourceVersionId").asText())
                        val targetId = UUID.fromString(event.payload.path("targetVersionId").asText())
                        amendmentActions.completeLink(amendmentId, sourceId, targetId, authorization)
                        editorRepository.insertOutboxEvent(
                            event.sessionId,
                            DomainEvents.AMENDMENT_RECORDED,
                            mapOf("amendmentId" to amendmentId, "sourceVersionId" to sourceId, "targetVersionId" to targetId),
                            publishedAt = Instant.now(),
                        )
                    }
                    DomainEvents.REVIEW_STATUS_REFRESH_REQUESTED -> amendmentActions.refresh(
                        UUID.fromString(event.payload.path("constitutionId").asText()),
                        UUID.fromString(event.payload.path("legalVersionId").asText()),
                        authorization,
                    )
                }
                editorRepository.markOutboxPublished(event.id)
            } catch (ex: RuntimeException) {
                log.warn("amendment outbox {} failed: {}", event.id, ex.message)
                editorRepository.markOutboxFailed(event.id, ex.message ?: ex.javaClass.simpleName)
            }
        }
    }

    companion object {
        private const val BATCH_SIZE = 10
    }
}

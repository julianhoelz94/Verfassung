package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.client.SearchIndexClient
import com.constitutionatlas.editor.repo.EditorRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class OutboxPublisher(
    private val editorRepository: EditorRepository,
    private val searchIndexClient: SearchIndexClient,
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
    }

    companion object {
        private const val BATCH_SIZE = 10
    }
}

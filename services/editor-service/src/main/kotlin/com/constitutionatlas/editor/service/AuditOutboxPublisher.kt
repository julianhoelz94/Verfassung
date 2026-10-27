package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.client.AuditDeliveryClient
import com.constitutionatlas.editor.repo.AuditOutboxRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

@Component
class AuditOutboxPublisher(private val outbox: AuditOutboxRepository, private val delivery: AuditDeliveryClient, transactions: PlatformTransactionManager) {
    private val transaction = TransactionTemplate(transactions)
    private val log = LoggerFactory.getLogger(javaClass)

    @Scheduled(fixedDelayString = "\${editor.audit.poll-ms:5000}", initialDelayString = "\${editor.audit.poll-ms:5000}")
    fun processDue() {
        repeat(10) {
            val found = transaction.execute {
                val event = outbox.claimNext() ?: return@execute false
                try {
                    delivery.deliver(event)
                    outbox.delivered(event.eventId)
                } catch (ex: RuntimeException) {
                    log.warn("editor audit delivery {} failed: {}", event.eventId, ex.javaClass.simpleName)
                    outbox.failed(event.eventId, ex.javaClass.simpleName)
                }
                true
            }
            if (found != true) return
        }
    }
}

package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.repo.ImportPublicationOutbox
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestClient
import java.net.http.HttpClient
import java.time.Duration

@Service
class ImportPublicationDelivery(
    private val outbox: ImportPublicationOutbox,
    private val mapper: ObjectMapper,
    @Value("\${audit.api.url}") auditUrl: String,
    @Value("\${search.api.url}") searchUrl: String,
    @Value("\${ingestion.audit.token:}") private val auditToken: String,
    @Value("\${ingestion.search.token:}") private val searchToken: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val audit = client(auditUrl)
    private val search = client(searchUrl)

    @Scheduled(initialDelay = 30_000, fixedDelay = 30_000)
    @Transactional
    fun deliverPending() {
        for (event in outbox.pending()) {
            try {
                when (event.type) {
                    "audit_publish" -> {
                        if (auditToken.isBlank()) continue
                        audit.post().uri("/events").header("Authorization", bearer(auditToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(mapper.readTree(event.payload))
                            .retrieve().toBodilessEntity()
                    }
                    "search_reindex" -> {
                        if (searchToken.isBlank()) continue
                        search.post().uri("/reindex").header("Authorization", bearer(searchToken))
                            .retrieve().toBodilessEntity()
                    }
                    else -> error("Unknown publication event type")
                }
                outbox.delivered(event.id)
            } catch (ex: RuntimeException) {
                outbox.retry(event.id, event.attempts)
                log.warn("Import publication delivery {} failed on attempt {}: {}", event.id, event.attempts + 1, ex.javaClass.simpleName)
            }
        }
    }

    private fun bearer(value: String): String = if (value.startsWith("Bearer ")) value else "Bearer $value"

    private fun client(url: String): RestClient {
        val factory = JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build())
        factory.setReadTimeout(Duration.ofSeconds(60))
        return RestClient.builder().baseUrl(url).requestFactory(factory).build()
    }
}

package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.api.ChangeRecordRequest
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

@JsonIgnoreProperties(ignoreUnknown = true)
data class LinkedAmendment(
    val id: UUID,
    val constitutionId: UUID,
    val status: String,
    val title: String,
    val comment: String = "",
    val documents: List<ChangeRecordDocumentDto> = emptyList(),
    val sourceVersionId: UUID? = null,
    val targetVersionId: UUID? = null,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class ChangeRecordDocumentDto(val url: String? = null, val fileId: String? = null, val label: String? = null)

interface AmendmentClient {
    fun getAmendment(id: UUID, authorization: String?): LinkedAmendment?

    fun createAmendment(constitutionId: UUID, record: ChangeRecordRequest, authorization: String?): LinkedAmendment

    fun refreshReviewStatus(constitutionId: UUID, legalVersionId: UUID, authorization: String?)

    fun linkTarget(
        amendmentId: UUID,
        sourceVersionId: UUID,
        targetVersionId: UUID,
        authorization: String?,
    )

    fun publishAmendment(amendmentId: UUID, authorization: String?)
}

class RestAmendmentClient(
    amendmentUrl: String,
) : AmendmentClient {
    private val client: RestClient = timedRestClient(amendmentUrl)

    override fun getAmendment(id: UUID, authorization: String?): LinkedAmendment? =
        try {
            val request = client.get().uri("/amendments/{id}", id)
            authorize(request, authorization)
            request.retrieve().body(LinkedAmendment::class.java)
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) {
                null
            } else {
                throw DownstreamException("amendment lookup failed", ex)
            }
        } catch (ex: RestClientException) {
            throw DownstreamException("amendment lookup failed", ex)
        }

    override fun createAmendment(constitutionId: UUID, record: ChangeRecordRequest, authorization: String?): LinkedAmendment =
        try {
            val request = client.post().uri("/constitutions/{id}/amendments", constitutionId)
                .contentType(MediaType.APPLICATION_JSON)
            authorize(request, authorization)
            request.body(record).retrieve().body(LinkedAmendment::class.java)
                ?: throw DownstreamException("amendment create returned no body")
        } catch (ex: RestClientException) {
            throw DownstreamException("amendment create failed", ex)
        }

    override fun refreshReviewStatus(constitutionId: UUID, legalVersionId: UUID, authorization: String?) {
        try {
            val request = client.post().uri("/constitutions/{id}/amendments/refresh-review-status", constitutionId)
                .contentType(MediaType.APPLICATION_JSON)
            authorize(request, authorization)
            request.body(mapOf("legalVersionId" to legalVersionId)).retrieve().toBodilessEntity()
        } catch (ex: RestClientException) {
            throw DownstreamException("amendment refresh-review-status failed", ex)
        }
    }

    override fun linkTarget(
        amendmentId: UUID,
        sourceVersionId: UUID,
        targetVersionId: UUID,
        authorization: String?,
    ) {
        try {
            val request = client.post()
                .uri("/amendments/{id}/link-target", amendmentId)
                .contentType(MediaType.APPLICATION_JSON)
            authorize(request, authorization)
            request
                .body(
                    mapOf(
                        "sourceVersionId" to sourceVersionId,
                        "targetVersionId" to targetVersionId,
                    ),
                )
                .retrieve()
                .toBodilessEntity()
        } catch (ex: RestClientException) {
            throw DownstreamException("amendment link-target failed", ex)
        }
    }

    override fun publishAmendment(amendmentId: UUID, authorization: String?) {
        try {
            val request = client.post().uri("/amendments/{id}/publish", amendmentId)
            authorize(request, authorization)
            request.retrieve().toBodilessEntity()
        } catch (ex: RestClientException) {
            throw DownstreamException("amendment publish failed", ex)
        }
    }

    private fun authorize(spec: RestClient.RequestHeadersSpec<*>, authorization: String?) {
        if (!authorization.isNullOrBlank()) {
            spec.header("Authorization", authorization)
        }
    }
}

@Configuration
class AmendmentClientConfig {
    @Bean
    @ConditionalOnMissingBean(AmendmentClient::class)
    fun amendmentClient(
        @Value("\${amendment.api.url}") amendmentUrl: String,
    ): AmendmentClient = RestAmendmentClient(amendmentUrl)
}

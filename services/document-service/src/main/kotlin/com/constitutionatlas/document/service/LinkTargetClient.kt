package com.constitutionatlas.document.service

import com.constitutionatlas.platform.NotFoundException
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

interface LinkTargetClient {
    fun requireTarget(targetType: String, targetId: UUID, authorization: String?)
}

@Component
class RestLinkTargetClient(
    @Value("\${catalog.api.url:http://localhost/api/catalog}") catalogUrl: String,
    @Value("\${amendment.api.url:http://localhost/api/amendment}") amendmentUrl: String,
) : LinkTargetClient {
    private val catalog = timedRestClient(catalogUrl)
    private val amendment = timedRestClient(amendmentUrl)

    override fun requireTarget(targetType: String, targetId: UUID, authorization: String?) {
        val (client, path) = when (targetType) {
            "constitution" -> catalog to "/constitutions/$targetId/metadata"
            "amendment" -> amendment to "/amendments/$targetId"
            else -> throw IllegalArgumentException("Unsupported link target")
        }
        try {
            val call = client.get().uri(path)
            val response = if (authorization != null) call.header("Authorization", authorization) else call
            response.retrieve().toBodilessEntity()
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) throw NotFoundException("Link target not found")
            throw ex
        }
    }
}

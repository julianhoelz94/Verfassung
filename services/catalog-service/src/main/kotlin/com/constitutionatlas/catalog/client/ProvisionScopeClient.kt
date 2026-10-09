package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.ConflictException
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

interface ProvisionScope {
    fun requireUnits(versionId: UUID, logicalUnitIds: List<UUID>)
}

@Component
class ProvisionScopeClient(
    @Value("\${content.api.url:http://localhost/api/content}") contentUrl: String,
) : ProvisionScope {
    private val content = timedRestClient(contentUrl)

    override fun requireUnits(versionId: UUID, logicalUnitIds: List<UUID>) {
        logicalUnitIds.forEach { logicalId ->
            try {
                content.get().uri("/versions/$versionId/resolve?logicalId=$logicalId").retrieve().toBodilessEntity()
            } catch (error: RestClientResponseException) {
                if (error.statusCode.value() == 404) {
                    throw ConflictException("Logical unit $logicalId is not present in the source version", "unknown_provision_scope")
                }
                throw error
            }
        }
    }
}

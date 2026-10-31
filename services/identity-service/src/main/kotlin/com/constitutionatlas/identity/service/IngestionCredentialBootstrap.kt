package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.setup.SetupRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/** Deployment-managed credentials, independent of demo/user seeding. Never log their values. */
@Component
@Order(3)
@ConditionalOnProperty("identity.internal.ingestion-credentials.enabled", havingValue = "true")
class IngestionCredentialBootstrap(
    private val users: IdentityRepository,
    private val setup: SetupRepository,
    @Value("\${identity.internal.ingestion-credentials.publish:}") private val publish: String,
    @Value("\${identity.internal.ingestion-credentials.audit:}") private val audit: String,
    @Value("\${identity.internal.ingestion-credentials.search:}") private val search: String,
) : ApplicationRunner {
    @Transactional
    override fun run(args: ApplicationArguments) {
        provisionManagedCredentials(
            users,
            setup,
            listOf(
                ManagedServiceCredential("managed-ingestion-publisher", publish, listOf("ingestion:publish")),
                ManagedServiceCredential("managed-ingestion-audit", audit, listOf("audit:append")),
                ManagedServiceCredential("managed-ingestion-search", search, listOf("search:reindex")),
            ),
        )
    }
}

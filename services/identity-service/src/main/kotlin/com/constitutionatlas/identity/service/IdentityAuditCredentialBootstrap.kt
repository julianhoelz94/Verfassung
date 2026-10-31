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

@Component
@Order(3)
@ConditionalOnProperty("identity.internal.audit-credentials.enabled", havingValue = "true")
class IdentityAuditCredentialBootstrap(
    private val users: IdentityRepository,
    private val setup: SetupRepository,
    @Value("\${audit.api.bearer:}") private val token: String,
) : ApplicationRunner {
    @Transactional
    override fun run(args: ApplicationArguments) {
        provisionManagedCredentials(users, setup, listOf(ManagedServiceCredential("managed-identity-audit", token, listOf("audit:append"))))
    }
}

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

/** Internal Editor publication/outbox access, independent of fixture accounts and administrator sessions. */
@Component
@Order(3)
@ConditionalOnProperty("identity.internal.editor-credentials.enabled", havingValue = "true")
class EditorCredentialBootstrap(
    private val users: IdentityRepository,
    private val setup: SetupRepository,
    @Value("\${identity.internal.editor-credentials.token:}") private val token: String,
) : ApplicationRunner {
    @Transactional
    override fun run(args: ApplicationArguments) {
        provisionManagedCredentials(users, setup, listOf(ManagedServiceCredential("managed-editor", token, SCOPES)))
    }

    companion object {
        val SCOPES = listOf("catalog:write", "catalog:publish", "content:write", "amendment:write", "amendment:publish", "audit:append", "search:reindex")
    }
}

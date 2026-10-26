package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.setup.SetupRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime
import java.time.ZoneOffset

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
        val credentials = listOf(
            Triple("managed-ingestion-publisher", publish, "ingestion:publish"),
            Triple("managed-ingestion-audit", audit, "audit:append"),
            Triple("managed-ingestion-search", search, "search:reindex"),
        )
        check(credentials.all { (_, value, _) -> value.length >= 43 && value.matches(Regex("[A-Za-z0-9_-]+")) }) {
            "Managed ingestion credentials require three independent deployment-generated secrets"
        }
        check(credentials.map { it.second }.distinct().size == credentials.size) { "Managed ingestion credentials must be distinct" }
        // SetupBootstrap (order 2) has already created/designated the real administrator.
        // Locking its durable singleton also serializes concurrent bootstrap attempts.
        val admin = setup.get(lock = true).bootstrapAdminId
            ?: users.listUsers().firstOrNull { it.enabled && "admin" in users.rolesForUser(it.id) }?.id
            ?: error("An administrator is required for managed ingestion credentials")
        check("admin" in users.rolesForUser(admin)) { "Managed ingestion credentials require the bootstrap administrator" }
        val expiry = OffsetDateTime.now(ZoneOffset.UTC).plusDays(ServiceTokenService.DEFAULT_TTL_DAYS)
        for ((name, plaintext, scope) in credentials) {
            val hash = Tokens.sha256Hex(plaintext)
            val existing = users.findActiveServiceTokenByName(name)
            if (existing == null) {
                users.insertServiceToken(name, hash, listOf(scope), admin, expiry)
            } else {
                check(existing.createdBy == admin) { "Managed ingestion credential name is already owned by another account" }
                users.replaceActiveServiceTokenScopes(name, listOf(scope))
                if (existing.tokenHash != hash) {
                    users.rotateServiceToken(existing.id, hash, expiry)
                } else {
                    users.renewActiveServiceTokenExpiry(name, expiry)
                }
            }
        }
    }
}

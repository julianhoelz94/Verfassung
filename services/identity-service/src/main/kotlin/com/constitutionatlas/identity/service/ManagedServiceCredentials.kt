package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.setup.SetupRepository
import java.time.OffsetDateTime
import java.time.ZoneOffset

internal data class ManagedServiceCredential(val name: String, val plaintext: String, val scopes: List<String>)

/** Called within the bootstrap runner's transaction. Never log or return plaintext credentials. */
internal fun provisionManagedCredentials(users: IdentityRepository, setup: SetupRepository, credentials: List<ManagedServiceCredential>) {
    check(credentials.all { it.plaintext.length >= 43 && it.plaintext.matches(Regex("[A-Za-z0-9_-]+")) }) {
        "Managed service credentials require independent deployment-generated secrets"
    }
    check(credentials.map { it.plaintext }.distinct().size == credentials.size) { "Managed service credentials must be distinct" }
    // SetupBootstrap (order 2) has already designated the real administrator.
    // Its durable singleton lock also serializes concurrent bootstrap attempts.
    val admin = setup.get(lock = true).bootstrapAdminId
        ?: users.listUsers().firstOrNull { it.enabled && "admin" in users.rolesForUser(it.id) }?.id
        ?: error("An administrator is required for managed service credentials")
    check("admin" in users.rolesForUser(admin)) { "Managed service credentials require the bootstrap administrator" }
    val expiry = OffsetDateTime.now(ZoneOffset.UTC).plusDays(ServiceTokenService.DEFAULT_TTL_DAYS)
    for ((name, plaintext, scopes) in credentials) {
        val hash = Tokens.sha256Hex(plaintext)
        val existing = users.findActiveServiceTokenByName(name)
        if (existing == null) {
            users.insertServiceToken(name, hash, scopes, admin, expiry)
        } else {
            check(existing.createdBy == admin) { "Managed service credential name is already owned by another account" }
            users.replaceActiveServiceTokenScopes(name, scopes)
            if (existing.tokenHash != hash) {
                users.rotateServiceToken(existing.id, hash, expiry)
            } else {
                users.renewActiveServiceTokenExpiry(name, expiry)
            }
        }
    }
}

package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.config.IdentitySeedProperties
import com.constitutionatlas.identity.repo.IdentityRepository
import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.annotation.Order
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component

@Component
@Order(1)
class IdentitySeedRunner(
    private val properties: IdentitySeedProperties,
    private val identityRepository: IdentityRepository,
    private val passwordEncoder: PasswordEncoder,
    private val mfaService: MfaService,
) : ApplicationRunner {
    private val log = LoggerFactory.getLogger(javaClass)

    override fun run(args: ApplicationArguments) {
        val mode = properties.mode.trim().lowercase()
        if (mode == "off" || mode.isBlank()) {
            log.info("Identity seed mode is off")
            return
        }
        if (mode != "create-only" && mode != "reset") {
            throw IllegalStateException("identity.seed.mode must be off, create-only, or reset")
        }
        upsert(properties.editorEmail, properties.editorPassword, listOf("editor", "reviewer", "publisher"), mode)
        upsert(properties.reviewerEmail, properties.reviewerPassword, listOf("reviewer"), mode)
        upsert(properties.publisherEmail, properties.publisherPassword, listOf("publisher"), mode)
        upsert(properties.adminEmail, properties.adminPassword, listOf("admin"), mode)
        upsert(properties.viewerEmail, properties.viewerPassword, listOf("viewer"), mode)
    }

    private fun upsert(email: String, password: String, roleNames: List<String>, mode: String) {
        if (email.isBlank() || password.isBlank()) {
            return
        }
        val existing = identityRepository.findUserByEmail(email)
        val userId =
            if (existing == null) {
                identityRepository.insertUser(email, passwordEncoder.encode(password))
            } else if (mode == "reset") {
                identityRepository.updatePasswordHash(existing.id, passwordEncoder.encode(password))
                existing.id
            } else {
                existing.id
            }
        roleNames.forEach { roleName ->
            val roleId = identityRepository.findRoleId(roleName) ?: return@forEach
            identityRepository.assignRole(userId, roleId)
        }
        if (
            properties.totpSecret.isNotBlank() &&
            roleNames.any { it == "admin" || it == "publisher" }
        ) {
            mfaService.ensureSeedTotp(userId, properties.totpSecret)
        }
    }
}

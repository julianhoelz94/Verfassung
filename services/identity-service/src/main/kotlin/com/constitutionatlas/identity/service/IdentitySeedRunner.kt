package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.config.IdentitySeedProperties
import com.constitutionatlas.identity.repo.IdentityRepository
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component

@Component
class IdentitySeedRunner(
    private val properties: IdentitySeedProperties,
    private val identityRepository: IdentityRepository,
    private val passwordEncoder: PasswordEncoder,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        // Combined local-editor account keeps review + publish for one-login tests.
        upsert(properties.editorEmail, properties.editorPassword, listOf("editor", "reviewer", "publisher"))
        upsert(properties.reviewerEmail, properties.reviewerPassword, listOf("reviewer"))
        upsert(properties.publisherEmail, properties.publisherPassword, listOf("publisher"))
        upsert(properties.adminEmail, properties.adminPassword, listOf("admin"))
        upsert(properties.viewerEmail, properties.viewerPassword, listOf("viewer"))
    }

    private fun upsert(email: String, password: String, roleNames: List<String>) {
        if (email.isBlank() || password.isBlank()) {
            return
        }
        val existing = identityRepository.findUserByEmail(email)
        val userId = if (existing == null) {
            identityRepository.insertUser(email, passwordEncoder.encode(password))
        } else {
            identityRepository.updatePasswordHash(existing.id, passwordEncoder.encode(password))
            existing.id
        }
        roleNames.forEach { roleName ->
            val roleId = identityRepository.findRoleId(roleName) ?: return@forEach
            identityRepository.assignRole(userId, roleId)
        }
    }
}

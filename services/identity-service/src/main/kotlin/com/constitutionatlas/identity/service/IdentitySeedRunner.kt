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
        upsert("editor", properties.editorEmail, properties.editorPassword)
        upsert("admin", properties.adminEmail, properties.adminPassword)
        upsert("viewer", properties.viewerEmail, properties.viewerPassword)
    }

    private fun upsert(roleName: String, email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            return
        }
        val roleId = identityRepository.findRoleId(roleName) ?: return
        val existing = identityRepository.findUserByEmail(email)
        val userId = if (existing == null) {
            identityRepository.insertUser(email, passwordEncoder.encode(password))
        } else {
            identityRepository.updatePasswordHash(existing.id, passwordEncoder.encode(password))
            existing.id
        }
        identityRepository.assignRole(userId, roleId)
    }
}

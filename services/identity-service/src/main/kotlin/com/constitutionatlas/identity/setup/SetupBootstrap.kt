package com.constitutionatlas.identity.setup

import com.constitutionatlas.identity.config.IdentitySeedProperties
import com.constitutionatlas.identity.repo.IdentityRepository
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.annotation.Order
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
@Order(2)
class SetupBootstrap(
    private val repository: SetupRepository,
    private val users: IdentityRepository,
    private val seed: IdentitySeedProperties,
    private val passwordEncoder: PasswordEncoder,
    private val configuration: DeploymentConfiguration,
) : ApplicationRunner {
    @Transactional
    override fun run(args: ApplicationArguments) {
        configuration.validateTransport()
        val state = repository.get(lock = true)
        configuration.languages(state)
        if (state.completedAt != null) return
        if (configuration.fixture) {
            repository.complete()
            return
        }
        if (state.bootstrapAdminId != null) return
        val email = seed.adminEmail.trim().lowercase()
        val password = seed.adminPassword
        check(email.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) && password.isNotBlank()) { "Bootstrap administrator email and password are required for a new installation" }
        if (configuration.production) check(password.length >= 12 && password !in setOf("change-me", "use-secret-store")) { "Bootstrap administrator password must contain at least 12 characters" }
        val existing = users.findUserByEmail(email)
        check(existing == null || "admin" in users.rolesForUser(existing.id)) { "Bootstrap email belongs to a non-administrator" }
        val id = existing?.id ?: users.insertUser(email, passwordEncoder.encode(password)).also {
            users.assignRole(it, users.findRoleId("admin") ?: error("Administrator role missing"))
        }
        repository.designate(id)
    }
}

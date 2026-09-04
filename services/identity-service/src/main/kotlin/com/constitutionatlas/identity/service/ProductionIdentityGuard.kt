package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.config.IdentitySeedProperties
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Profile
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component

@Component
@Profile("production")
@Order(Ordered.HIGHEST_PRECEDENCE)
class ProductionIdentityGuard(
    private val seedProperties: IdentitySeedProperties,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val mode = seedProperties.mode.trim().lowercase()
        if (mode != "off") {
            throw IllegalStateException("Production identity.seed.mode must be off")
        }
        val demoEmails =
            listOf(
                seedProperties.editorEmail,
                seedProperties.reviewerEmail,
                seedProperties.publisherEmail,
                seedProperties.adminEmail,
                seedProperties.viewerEmail,
            )
        val demoPasswords =
            listOf(
                seedProperties.editorPassword,
                seedProperties.reviewerPassword,
                seedProperties.publisherPassword,
                seedProperties.adminPassword,
                seedProperties.viewerPassword,
            )
        if (demoEmails.any { it.contains("example.local", ignoreCase = true) }) {
            throw IllegalStateException("Production rejects demo seed emails")
        }
        if (demoPasswords.any { it.equals("change-me", ignoreCase = true) || it.equals("use-secret-store", ignoreCase = true) }) {
            throw IllegalStateException("Production rejects default/demo credentials")
        }
    }
}

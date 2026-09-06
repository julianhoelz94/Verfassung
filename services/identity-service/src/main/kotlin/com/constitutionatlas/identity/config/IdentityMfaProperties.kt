package com.constitutionatlas.identity.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

@ConfigurationProperties(prefix = "identity.mfa")
data class IdentityMfaProperties(
    var encryptionKey: String = "local-mfa-dev-key",
    var stepUpTtl: Duration = Duration.ofMinutes(5),
    var challengeTtl: Duration = Duration.ofMinutes(5),
    var issuer: String = "Constitution Atlas",
)

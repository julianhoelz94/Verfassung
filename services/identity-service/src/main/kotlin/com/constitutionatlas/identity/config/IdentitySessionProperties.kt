package com.constitutionatlas.identity.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

@ConfigurationProperties(prefix = "identity.session")
data class IdentitySessionProperties(
    var idleTimeout: Duration = Duration.ofMinutes(30),
    var absoluteTimeout: Duration = Duration.ofHours(24),
)

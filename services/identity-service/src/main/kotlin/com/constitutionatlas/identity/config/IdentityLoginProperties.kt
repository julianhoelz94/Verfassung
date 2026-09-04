package com.constitutionatlas.identity.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

@ConfigurationProperties(prefix = "identity.login")
data class IdentityLoginProperties(
    var failureThreshold: Int = 5,
    var lockouts: List<Duration> =
        listOf(
            Duration.ofMinutes(1),
            Duration.ofMinutes(5),
            Duration.ofMinutes(15),
            Duration.ofHours(1),
        ),
)

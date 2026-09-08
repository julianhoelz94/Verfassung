package com.constitutionatlas.identity.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "identity.mail")
data class IdentityMailProperties(
    var enabled: Boolean = true,
    var from: String = "",
    var fromName: String = "Constitution Atlas",
    var publicBaseUrl: String = "",
    var host: String = "",
    var port: Int = 587,
    var username: String = "",
    var password: String = "",
    var auth: Boolean = true,
    var startTls: Boolean = true,
    var ssl: Boolean = false,
) {
    fun configured(): Boolean =
        enabled &&
            host.isNotBlank() &&
            from.contains("@") &&
            publicBaseUrl.isNotBlank()
}

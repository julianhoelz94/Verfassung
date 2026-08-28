package com.constitutionatlas.identity.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "identity.seed")
data class IdentitySeedProperties(
    var editorEmail: String = "",
    var editorPassword: String = "",
    var adminEmail: String = "",
    var adminPassword: String = "",
    var viewerEmail: String = "",
    var viewerPassword: String = "",
)

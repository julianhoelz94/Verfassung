package com.constitutionatlas.identity.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "identity.seed")
data class IdentitySeedProperties(
    var mode: String = "off",
    var editorEmail: String = "",
    var editorPassword: String = "",
    var reviewerEmail: String = "",
    var reviewerPassword: String = "",
    var publisherEmail: String = "",
    var publisherPassword: String = "",
    var adminEmail: String = "",
    var adminPassword: String = "",
    var viewerEmail: String = "",
    var viewerPassword: String = "",
)

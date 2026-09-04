package com.constitutionatlas.editor.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "editor.publish")
data class EditorPublishProperties(
    var rewritePublicContent: Boolean = true,
)

package com.constitutionatlas.identity.setup

import com.constitutionatlas.identity.config.IdentityMfaProperties
import com.constitutionatlas.identity.crypto.SecretBox
import com.constitutionatlas.identity.repo.StoredIdentitySettings
import com.constitutionatlas.platform.scalarText
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.ObjectNode

@Component
class SettingsEnvironment(private val configuration: DeploymentConfiguration, private val mapper: ObjectMapper, mfa: IdentityMfaProperties) {
    private val box = SecretBox(mfa.encryptionKey)
    private val overrides: Map<String, Any> = DeploymentConfiguration.descriptors.filter { it.group in setOf("email", "access") }.mapNotNull { descriptor ->
        configuration.value(descriptor.environment)?.let { value ->
            val parsed: Any = when (descriptor.key) {
                "selfRegistrationEnabled", "mailEnabled", "smtpAuth", "smtpStarttls", "smtpSsl" -> value.toBooleanStrict()
                "smtpPort" -> value.toInt().also { require(it in 1..65535) { "Invalid SMTP_PORT" } }
                "smtpPassword" -> box.encrypt(value)
                else -> value
            }
            (if (descriptor.key == "smtpPassword") "smtpPasswordCipher" else descriptor.key) to parsed
        }
    }.toMap()

    fun effective(stored: StoredIdentitySettings): StoredIdentitySettings {
        val tree = mapper.valueToTree<ObjectNode>(stored)
        if (tree.path("mailPublicBaseUrl").scalarText().isBlank()) tree.put("mailPublicBaseUrl", configuration.publicUrl)
        overrides.forEach { (key, value) -> tree.set(key, mapper.valueToTree(value)) }
        return mapper.treeToValue(tree, StoredIdentitySettings::class.java)
    }

    // A deployment override must never replace the saved value it temporarily masks.
    fun writable(updated: StoredIdentitySettings, stored: StoredIdentitySettings): StoredIdentitySettings {
        val tree = mapper.valueToTree<ObjectNode>(updated)
        val original = mapper.valueToTree<ObjectNode>(stored)
        overrides.keys.forEach { tree.set(it, original[it]) }
        return mapper.treeToValue(tree, StoredIdentitySettings::class.java)
    }

    fun request(request: com.constitutionatlas.identity.api.UpdateIdentitySettingsRequest): com.constitutionatlas.identity.api.UpdateIdentitySettingsRequest {
        val tree = mapper.valueToTree<ObjectNode>(request)
        DeploymentConfiguration.descriptors.filter { it.group in setOf("email", "access") }.forEach { descriptor ->
            configuration.value(descriptor.environment)?.let { value ->
                val parsed: Any = when (descriptor.key) {
                    "selfRegistrationEnabled", "mailEnabled", "smtpAuth", "smtpStarttls", "smtpSsl" -> value.toBooleanStrict()
                    "smtpPort" -> value.toInt()
                    else -> value
                }
                tree.set(descriptor.key, mapper.valueToTree(parsed))
            }
        }
        if (configuration.value("SMTP_PASSWORD") != null) tree.put("clearSmtpPassword", false)
        return mapper.treeToValue(tree, com.constitutionatlas.identity.api.UpdateIdentitySettingsRequest::class.java)
    }

    fun managedKeys(): Set<String> = DeploymentConfiguration.descriptors.filter { configuration.value(it.environment) != null }.map { it.key }.toSet()
}

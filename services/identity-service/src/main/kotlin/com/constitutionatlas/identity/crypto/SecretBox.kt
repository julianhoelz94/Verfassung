package com.constitutionatlas.identity.crypto

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class SecretBox(
    keyMaterial: String,
    private val random: SecureRandom = SecureRandom(),
) {
    private val key = SecretKeySpec(normalizeKey(keyMaterial), "AES")

    fun encrypt(plain: String): String {
        val iv = ByteArray(12)
        random.nextBytes(iv)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv))
        val packed = iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.getEncoder().encodeToString(packed)
    }

    fun decrypt(cipherText: String): String {
        val packed = Base64.getDecoder().decode(cipherText)
        require(packed.size > 12) { "Invalid cipher text" }
        val iv = packed.copyOfRange(0, 12)
        val body = packed.copyOfRange(12, packed.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        return cipher.doFinal(body).toString(Charsets.UTF_8)
    }

    companion object {
        fun normalizeKey(material: String): ByteArray {
            val trimmed = material.trim()
            val decoded =
                runCatching { Base64.getDecoder().decode(trimmed) }.getOrNull()
                    ?.takeIf { it.size == 32 }
            return decoded ?: MessageDigest.getInstance("SHA-256").digest(trimmed.toByteArray(Charsets.UTF_8))
        }
    }
}

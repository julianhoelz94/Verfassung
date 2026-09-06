package com.constitutionatlas.identity.crypto

import com.constitutionatlas.identity.UnauthorizedException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.HexFormat

object Tokens {
    fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }

    fun urlToken(random: SecureRandom, byteCount: Int = 32): String {
        val bytes = ByteArray(byteCount)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun requireBearer(authorization: String?): String {
        val value = authorization?.trim().orEmpty()
        if (!value.startsWith("Bearer ")) {
            throw UnauthorizedException("Missing session")
        }
        return value.removePrefix("Bearer ").trim().ifBlank {
            throw UnauthorizedException("Missing session")
        }
    }
}

package com.constitutionatlas.identity.crypto

import java.nio.ByteBuffer
import java.time.Instant
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.pow

object Totp {
    private const val PERIOD_SECONDS = 30L
    private const val DIGITS = 6

    fun generate(
        secretBase32: String,
        instant: Instant = Instant.now(),
        periodSeconds: Long = PERIOD_SECONDS,
        digits: Int = DIGITS,
    ): String {
        val counter = instant.epochSecond / periodSeconds
        return otp(Base32.decode(secretBase32), counter, digits)
    }

    fun matches(
        secretBase32: String,
        code: String,
        instant: Instant = Instant.now(),
        periodSeconds: Long = PERIOD_SECONDS,
        window: Int = 1,
    ): Boolean {
        val normalized = code.trim().replace(" ", "")
        if (normalized.length != DIGITS || normalized.any { !it.isDigit() }) {
            return false
        }
        val secret = Base32.decode(secretBase32)
        val counter = instant.epochSecond / periodSeconds
        return (-window..window).any { offset -> otp(secret, counter + offset, DIGITS) == normalized }
    }

    fun otpauthUrl(
        issuer: String,
        account: String,
        secretBase32: String,
    ): String {
        val label = encode("${issuer.trim()}:${account.trim()}")
        val query =
            "secret=$secretBase32&issuer=${encode(issuer.trim())}&digits=$DIGITS&period=$PERIOD_SECONDS"
        return "otpauth://totp/$label?$query"
    }

    private fun otp(
        secret: ByteArray,
        counter: Long,
        digits: Int,
    ): String {
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(secret, "HmacSHA1"))
        val hash = mac.doFinal(ByteBuffer.allocate(8).putLong(counter).array())
        val offset = hash.last().toInt() and 0x0f
        val binary =
            ((hash[offset].toInt() and 0x7f) shl 24) or
                ((hash[offset + 1].toInt() and 0xff) shl 16) or
                ((hash[offset + 2].toInt() and 0xff) shl 8) or
                (hash[offset + 3].toInt() and 0xff)
        val modulus = 10.0.pow(digits).toInt()
        return (binary % modulus).toString().padStart(digits, '0')
    }

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, Charsets.UTF_8).replace("+", "%20")
}

object Base32 {
    private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    fun encode(bytes: ByteArray): String {
        if (bytes.isEmpty()) {
            return ""
        }
        val output = StringBuilder((bytes.size * 8 + 4) / 5)
        var buffer = 0
        var bitsLeft = 0
        for (byte in bytes) {
            buffer = (buffer shl 8) or (byte.toInt() and 0xff)
            bitsLeft += 8
            while (bitsLeft >= 5) {
                output.append(ALPHABET[(buffer shr (bitsLeft - 5)) and 0x1f])
                bitsLeft -= 5
            }
        }
        if (bitsLeft > 0) {
            output.append(ALPHABET[(buffer shl (5 - bitsLeft)) and 0x1f])
        }
        return output.toString()
    }

    fun decode(text: String): ByteArray {
        val cleaned = text.trim().uppercase().replace("=", "").replace(" ", "")
        if (cleaned.isEmpty()) {
            return ByteArray(0)
        }
        val output = ArrayList<Byte>((cleaned.length * 5) / 8)
        var buffer = 0
        var bitsLeft = 0
        for (char in cleaned) {
            val value = ALPHABET.indexOf(char)
            require(value >= 0) { "Invalid base32 character" }
            buffer = (buffer shl 5) or value
            bitsLeft += 5
            if (bitsLeft >= 8) {
                output.add(((buffer shr (bitsLeft - 8)) and 0xff).toByte())
                bitsLeft -= 8
            }
        }
        return output.toByteArray()
    }
}

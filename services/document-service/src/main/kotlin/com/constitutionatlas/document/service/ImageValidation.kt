package com.constitutionatlas.document.service

/** Inspect signatures and dimensions before storing images; malformed decoders fail closed. */
internal object ImageValidation {
    fun accepts(contentType: String, bytes: ByteArray): Boolean =
        validImageSignature(contentType, bytes) && runCatching { validImageDimensions(contentType, bytes) }.getOrDefault(false)

    private fun validImageSignature(contentType: String, bytes: ByteArray): Boolean {
        fun at(offset: Int, signature: ByteArray): Boolean =
            bytes.size >= offset + signature.size && signature.indices.all { bytes[offset + it] == signature[it] }
        fun ascii(value: String): ByteArray = value.toByteArray(Charsets.US_ASCII)
        return when (contentType) {
            "image/jpeg" -> at(0, byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte()))
            "image/png" -> at(0, byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
            "image/gif" -> at(0, ascii("GIF87a")) || at(0, ascii("GIF89a"))
            "image/webp" -> at(0, ascii("RIFF")) && at(8, ascii("WEBP"))
            "image/avif" -> at(4, ascii("ftyp")) && (at(8, ascii("avif")) || at(8, ascii("avis")))
            else -> false
        }
    }

    private fun validImageDimensions(contentType: String, bytes: ByteArray): Boolean {
        val dimensions = when (contentType) {
            "image/jpeg", "image/png", "image/gif" -> {
                javax.imageio.ImageIO.createImageInputStream(java.io.ByteArrayInputStream(bytes)).use { input ->
                    val readers = javax.imageio.ImageIO.getImageReaders(input)
                    if (!readers.hasNext()) return false
                    val reader = readers.next()
                    try {
                        reader.input = input
                        reader.getWidth(0) to reader.getHeight(0)
                    } finally {
                        reader.dispose()
                    }
                }
            }
            "image/webp" -> {
                if (bytes.size < 30) return false
                val subtype = String(bytes, 12, 4, Charsets.US_ASCII)
                when (subtype) {
                    "VP8X" -> {
                        val width = 1 + (bytes[24].toInt() and 255) + ((bytes[25].toInt() and 255) shl 8) + ((bytes[26].toInt() and 255) shl 16)
                        val height = 1 + (bytes[27].toInt() and 255) + ((bytes[28].toInt() and 255) shl 8) + ((bytes[29].toInt() and 255) shl 16)
                        width to height
                    }
                    "VP8L" -> {
                        if (bytes[20].toInt() and 255 != 0x2f) return false
                        val width = 1 + (bytes[21].toInt() and 255) + (((bytes[22].toInt() and 255) and 0x3f) shl 8)
                        val height = 1 + ((bytes[22].toInt() and 255) ushr 6) + ((bytes[23].toInt() and 255) shl 2) + (((bytes[24].toInt() and 255) and 0x0f) shl 10)
                        width to height
                    }
                    "VP8 " -> {
                        if (bytes[23] != 0x9d.toByte() || bytes[24] != 0x01.toByte() || bytes[25] != 0x2a.toByte()) return false
                        val width = (bytes[26].toInt() and 255) + (((bytes[27].toInt() and 255) and 0x3f) shl 8)
                        val height = (bytes[28].toInt() and 255) + (((bytes[29].toInt() and 255) and 0x3f) shl 8)
                        width to height
                    }
                    else -> return false
                }
            }
            "image/avif" -> {
                val marker = "ispe".toByteArray(Charsets.US_ASCII)
                val index = bytes.indices.firstOrNull { at ->
                    at + 16 <= bytes.size && marker.indices.all { bytes[at + it] == marker[it] }
                } ?: return false
                fun bigEndian(offset: Int): Int =
                    ((bytes[offset].toInt() and 255) shl 24) or
                        ((bytes[offset + 1].toInt() and 255) shl 16) or
                        ((bytes[offset + 2].toInt() and 255) shl 8) or
                        (bytes[offset + 3].toInt() and 255)
                bigEndian(index + 8) to bigEndian(index + 12)
            }
            else -> return false
        }
        return dimensions.first in 1..10000 && dimensions.second in 1..10000 && dimensions.first.toLong() * dimensions.second <= 100_000_000
    }
}

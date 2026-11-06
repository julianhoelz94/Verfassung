package com.constitutionatlas.document.service

import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.zip.ZipInputStream

/** Validate the declared type before bytes enter the immutable file store. */
internal object DocumentFileValidation {
    fun validate(fileName: String, contentType: String, bytes: ByteArray) {
        require(fileName.isNotBlank() && fileName.length <= 255 && fileName.none { it.code < 32 || it.code == 127 }) { "Invalid file name" }
        require(bytes.isNotEmpty() && bytes.size <= 20 * 1024 * 1024) { "File must be between 1 byte and 20 MB" }
        when (contentType) {
            "application/pdf" -> require(bytes.size >= 5 && String(bytes, 0, 5, Charsets.US_ASCII) == "%PDF-") { "PDF content is invalid" }
            "text/plain", "text/csv", "application/json" -> require(validText(bytes)) { "Text must use UTF-8 without binary content" }
            "application/octet-stream" -> Unit // Captured legacy sources are always downloaded, never executed inline.
            "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif" -> require(ImageValidation.accepts(contentType, bytes)) { "Image content or dimensions are invalid" }
            in officeTypes -> require(validOffice(contentType, bytes)) { "Office document content is invalid" }
            else -> throw IllegalArgumentException("Unsupported file type")
        }
    }

    private fun validText(bytes: ByteArray): Boolean =
        bytes.none { it == 0.toByte() } &&
            runCatching {
                Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes))
            }.isSuccess

    private val officeTypes = mapOf(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" to "word/document.xml",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" to "xl/workbook.xml",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" to "ppt/presentation.xml",
        "application/vnd.oasis.opendocument.text" to "content.xml",
        "application/vnd.oasis.opendocument.spreadsheet" to "content.xml",
        "application/vnd.oasis.opendocument.presentation" to "content.xml",
    )

    private class OfficeArchive {
        val names = mutableSetOf<String>()
        private var expanded = 0L
        var odfType: String? = null

        fun read(zip: ZipInputStream) {
            while (true) {
                val entry = zip.nextEntry ?: break
                require(names.size < 2048) { "Too many archive entries" }
                names.add(entry.name)
                val mime = readEntry(zip, entry.name == "mimetype")
                if (entry.name == "mimetype") odfType = mime
                zip.closeEntry()
            }
        }

        private fun readEntry(zip: ZipInputStream, isMime: Boolean): String {
            val buffer = ByteArray(8192)
            val mime = StringBuilder()
            while (true) {
                val count = zip.read(buffer)
                if (count < 0) break
                expanded += count
                require(expanded <= 100L * 1024 * 1024) { "Archive expands beyond limit" }
                if (isMime) {
                    require(mime.length + count <= 256) { "Invalid archive mimetype" }
                    mime.append(String(buffer, 0, count, Charsets.US_ASCII))
                }
            }
            return mime.toString()
        }
    }

    private fun validOffice(contentType: String, bytes: ByteArray): Boolean = runCatching {
        val archive = OfficeArchive()
        ZipInputStream(ByteArrayInputStream(bytes)).use(archive::read)
        officeTypes[contentType] in archive.names && if (contentType.startsWith("application/vnd.oasis")) archive.odfType == contentType else "[Content_Types].xml" in archive.names
    }.getOrDefault(false)
}

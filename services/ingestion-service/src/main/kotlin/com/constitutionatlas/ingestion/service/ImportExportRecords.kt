package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ExportValue
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID

/** A page of flattened values pinned to the exact serialized export tree. */
internal data class ImportExportRecordPage(val snapshotId: String, val records: List<ExportValue>, val totalRecords: Int, val nextCursor: String?, val complete: Boolean)

/** Lossless JSON flattening and bounded pages with cursors tied to one job, view and snapshot. */
internal class ImportExportRecords(private val mapper: ObjectMapper) {
    /** Hashes before flattening so property order, persisted generation and linked resources stay pinned. */
    fun page(id: UUID, view: String, cursor: String?, tree: JsonNode): ImportExportRecordPage {
        val serialized = mapper.writeValueAsBytes(tree)
        val snapshotId = MessageDigest.getInstance("SHA-256").digest(serialized).joinToString("") { "%02x".format(it) }
        val records = mutableListOf<ExportValue>()
        flatten(tree, "", records)
        val offset = offset(id, view, snapshotId, cursor)
        if (offset !in 0..records.size) bad("Invalid export offset")
        val page = batch(records, offset)
        val next = offset + page.size
        val nextCursor = if (next < records.size) Base64.getUrlEncoder().withoutPadding().encodeToString("$id:$view:$snapshotId:$next".toByteArray()) else null
        return ImportExportRecordPage(snapshotId, page, records.size, nextCursor, next == records.size)
    }

    /** Decodes the existing cursor format; a changed snapshot is a conflict rather than bad input. */
    private fun offset(id: UUID, view: String, snapshotId: String, cursor: String?): Int {
        if (cursor == null) return 0
        val decoded = runCatching { String(Base64.getUrlDecoder().decode(cursor)) }.getOrElse { bad("Invalid export cursor") }
        val parts = decoded.split(':')
        if (parts.size != 4 || parts[0] != id.toString() || parts[1] != view) bad("Cursor belongs to another export")
        if (parts[2] != snapshotId) throw ResponseStatusException(HttpStatus.CONFLICT, "Persisted snapshot changed; restart export")
        return parts[3].toIntOrNull() ?: bad("Invalid export offset")
    }

    /** Caps pages at 200 records or 128 KiB, while always allowing the first record to make progress. */
    private fun batch(records: List<ExportValue>, offset: Int): List<ExportValue> {
        val page = mutableListOf<ExportValue>()
        var bytes = 0
        for (record in records.drop(offset)) {
            val size = mapper.writeValueAsBytes(record).size
            if (page.isNotEmpty() && (bytes + size > 128 * 1024 || page.size >= 200)) break
            page += record
            bytes += size
        }
        return page
    }

    /** Preserves traversal order and empty containers, escaping object keys as JSON Pointer segments. */
    private fun flatten(node: JsonNode, path: String, result: MutableList<ExportValue>) {
        when {
            node.isObject && !node.isEmpty -> node.properties().forEach { (key, value) -> flatten(value, "$path/${key.replace("~", "~0").replace("/", "~1")}", result) }
            node.isArray && !node.isEmpty -> node.forEachIndexed { index, value -> flatten(value, "$path/$index", result) }
            node.isTextual && node.textValue().length > 16000 -> splitText(node.textValue(), path, result)
            else -> result += ExportValue(path, node)
        }
    }

    /** Chunks long text by UTF-16 length without splitting a surrogate pair or altering any characters. */
    private fun splitText(text: String, path: String, result: MutableList<ExportValue>) {
        var start = 0
        var index = 0
        while (start < text.length) {
            var end = minOf(start + 16000, text.length)
            if (end < text.length && text[end - 1].isHighSurrogate() && text[end].isLowSurrogate()) end--
            result += ExportValue("$path/@text/${index++}", mapper.valueToTree(text.substring(start, end)))
            start = end
        }
    }

    /** Keeps malformed cursor and offset responses compatible with the export endpoint. */
    private fun bad(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)
}

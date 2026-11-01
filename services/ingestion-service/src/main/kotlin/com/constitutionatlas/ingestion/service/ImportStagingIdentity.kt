package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.repo.ImportJobRepository
import com.constitutionatlas.platform.OrderedContentRules
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import tools.jackson.databind.ObjectMapper
import java.security.MessageDigest
import java.util.UUID

/** Identifies staged payloads with their historical serialized checksum and scoped retry key. */
internal class ImportStagingIdentity(private val repository: ImportJobRepository, private val mapper: ObjectMapper) {
    /** Validate the key before hashing, then reject a caller checksum before consulting receipts. */
    fun checksum(request: ImportRequest, key: String?, expectedChecksum: String?): String {
        if (key != null && key.length !in 8..128) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency key must contain 8 to 128 characters")
        val checksum = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(request)).joinToString("") { "%02x".format(it) }
        if (expectedChecksum != null && !checksum.equals(expectedChecksum, ignoreCase = true)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Payload checksum mismatch")
        }
        return checksum
    }

    /** Reuse only the selected owner's or batch's exact receipt, still enforcing current rich rules. */
    fun existing(request: ImportRequest, submittedBy: UUID, batchId: UUID?, key: String?, checksum: String): ImportJobDto? {
        if (key == null) return null
        val previous = if (batchId == null) repository.findDirectItem(submittedBy, key) else repository.findBatchItem(batchId, key)
        previous ?: return null
        if (previous.second != checksum) conflict()
        requireCurrentRichRules(request)
        return previous.first
    }

    /** Keep historical receipt reuse and preparation subject to the same current rich-content policy. */
    fun requireCurrentRichRules(request: ImportRequest) {
        OrderedContentRules.requireValid(ImportValidator.richContentValidationErrors(request.roots))
    }

    /** An insert race without a matching scoped receipt is always a content conflict. */
    fun conflict(): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, "Idempotency key was used for different content")
}

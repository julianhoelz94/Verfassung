package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.BeginUploadRequest
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.ImportUploadDto
import com.constitutionatlas.ingestion.api.UploadChunkRequest
import com.constitutionatlas.ingestion.repo.ImportUploadRepository
import com.constitutionatlas.ingestion.repo.UploadRow
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.NotFoundException
import com.fasterxml.jackson.core.StreamReadConstraints
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID

@Service
class ImportUploadService(
    private val uploads: ImportUploadRepository,
    private val imports: ImportService,
    private val mapper: ObjectMapper,
) {
    private val uploadMapper = mapper.copy().apply {
        factory.setStreamReadConstraints(
            StreamReadConstraints.builder().maxNestingDepth(32).maxDocumentLength(26L * 1024 * 1024)
                .maxStringLength(1_048_576).maxNameLength(256).build(),
        )
    }
    companion object {
        const val CHUNK_BYTES = 512 * 1024
        const val MAX_ITEM_BYTES = 25 * 1024 * 1024
        const val MAX_BATCH_BYTES = 100 * 1024 * 1024
    }

    @Transactional
    fun begin(batchId: UUID, actor: Actor, request: BeginUploadRequest): ImportUploadDto {
        val key = request.idempotencyKey.trim()
        if (key.length !in 8..128) bad("idempotencyKey must contain 8 to 128 characters")
        if (!request.checksumSha256.matches(Regex("[a-fA-F0-9]{64}"))) bad("checksumSha256 must be 64 hexadecimal characters")
        if (request.totalBytes !in 1..MAX_ITEM_BYTES) tooLarge("Upload must contain 1 to 25 MiB")
        val owner = uploads.lockBatchOwner(batchId) ?: throw NotFoundException("Unknown or expired import batch")
        if (owner != actor.id) throw ForbiddenException("Import batch belongs to another principal")
        uploads.byKey(batchId, key)?.let { existing ->
            if (existing.checksumSha256 != request.checksumSha256.lowercase() || existing.totalBytes != request.totalBytes) conflict("Idempotency key was used for another upload")
            return status(existing)
        }
        if (uploads.reservedBytes(batchId) + request.totalBytes > MAX_BATCH_BYTES) tooLarge("Batch upload quota is 100 MiB")
        val id = try {
            uploads.insert(batchId, actor.id, key, request.checksumSha256, request.totalBytes)
        } catch (ex: DuplicateKeyException) {
            val existing = uploads.byKey(batchId, key) ?: throw ex
            if (existing.checksumSha256 != request.checksumSha256.lowercase() || existing.totalBytes != request.totalBytes) conflict("Idempotency key was used for another upload")
            return status(existing)
        }
        return status(uploads.find(id)!!)
    }

    fun get(id: UUID, actor: Actor): ImportUploadDto = status(owned(id, actor))

    @Transactional
    fun cancel(id: UUID, actor: Actor): ImportUploadDto {
        val upload = owned(id, actor, lock = true)
        if (upload.status == "completed") conflict("Completed upload has already staged an item")
        if (upload.status == "receiving") uploads.cancel(id)
        return status(uploads.find(id)!!)
    }

    @Transactional
    fun putChunk(id: UUID, index: Int, actor: Actor, request: UploadChunkRequest): ImportUploadDto {
        val upload = owned(id, actor, lock = true)
        if (upload.status != "receiving") conflict("Upload is no longer receiving chunks")
        val count = chunkCount(upload)
        if (index !in 0 until count) bad("chunk index is out of range")
        if (request.dataBase64.length > 700_000) tooLarge("Chunk exceeds 512 KiB")
        val bytes = try {
            Base64.getDecoder().decode(request.dataBase64)
        } catch (ex: IllegalArgumentException) {
            bad("dataBase64 is not valid base64")
        }
        val expectedSize = if (index == count - 1) upload.totalBytes - index * CHUNK_BYTES else CHUNK_BYTES
        if (bytes.size != expectedSize) bad("chunk $index must contain exactly $expectedSize bytes")
        val checksum = sha256(bytes)
        if (!checksum.equals(request.checksumSha256, ignoreCase = true)) bad("chunk checksum mismatch")
        val previous = uploads.chunkChecksum(id, index)
        if (previous != null && previous != checksum) conflict("Chunk $index was already stored with different bytes")
        if (previous == null) uploads.insertChunk(id, index, bytes, checksum)
        return status(upload)
    }

    @Transactional
    fun complete(authorization: String?, id: UUID, actor: Actor): ImportUploadDto {
        val upload = owned(id, actor, lock = true)
        if (upload.status == "completed") return status(upload)
        if (upload.status == "canceled") conflict("Upload was canceled")
        if (status(upload).missingChunks.isNotEmpty()) conflict("Upload has missing chunks")
        val payload = ByteArrayOutputStream(upload.totalBytes)
        uploads.chunks(id).forEach(payload::write)
        val bytes = payload.toByteArray()
        if (bytes.size != upload.totalBytes || sha256(bytes) != upload.checksumSha256) bad("Full upload checksum mismatch")
        val request = try {
            uploadMapper.readValue(bytes, ImportRequest::class.java)
        } catch (ex: Exception) {
            bad("Uploaded JSON is not a valid import payload")
        }
        ImportValidator.requireConfirmedPinForScopedUpload(actor, request)
        val item = imports.stageBatchItem(authorization, upload.batchId, actor.id, com.constitutionatlas.ingestion.api.StageBatchItemRequest(upload.idempotencyKey, request))
        uploads.complete(id, item.id)
        return status(uploads.find(id)!!)
    }

    @Scheduled(fixedDelayString = "PT24H")
    fun cleanExpired() {
        uploads.cleanExpired()
    }

    private fun owned(id: UUID, actor: Actor, lock: Boolean = false): UploadRow {
        val upload = uploads.find(id, lock) ?: throw NotFoundException("Unknown or expired import upload")
        if (upload.ownerId != actor.id) throw ForbiddenException("Import upload belongs to another principal")
        return upload
    }

    private fun status(upload: UploadRow): ImportUploadDto {
        val missing = if (upload.status != "receiving") emptyList() else (0 until chunkCount(upload)).filterNot { it in uploads.chunkIndices(upload.id) }
        return ImportUploadDto(upload.id, upload.batchId, upload.status, upload.totalBytes, CHUNK_BYTES, missing, upload.itemId)
    }

    private fun chunkCount(upload: UploadRow): Int = (upload.totalBytes + CHUNK_BYTES - 1) / CHUNK_BYTES
    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    private fun bad(message: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, message)
    private fun conflict(message: String): Nothing = throw ResponseStatusException(HttpStatus.CONFLICT, message)
    private fun tooLarge(message: String): Nothing = throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, message)
}

package com.constitutionatlas.ingestion.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

data class UploadRow(
    val id: UUID,
    val batchId: UUID,
    val ownerId: UUID,
    val idempotencyKey: String,
    val checksumSha256: String,
    val totalBytes: Int,
    val status: String,
    val itemId: UUID?,
)

@Repository
class ImportUploadRepository(private val jdbc: JdbcTemplate) {
    fun lockBatchOwner(batchId: UUID): UUID? = jdbc.query(
        "SELECT owner_id FROM import_batches WHERE id = ? AND expires_at > now() FOR UPDATE",
        { rs, _ -> rs.getObject("owner_id", UUID::class.java) },
        batchId,
    ).firstOrNull()

    fun reservedBytes(batchId: UUID): Long = jdbc.queryForObject(
        "SELECT COALESCE(sum(total_bytes), 0) FROM import_uploads WHERE batch_id = ? AND status = 'receiving' AND expires_at > now()",
        Long::class.java,
        batchId,
    ) ?: 0L

    fun insert(batchId: UUID, ownerId: UUID, key: String, checksum: String, totalBytes: Int): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO import_uploads (id, batch_id, owner_id, idempotency_key, checksum_sha256, total_bytes) VALUES (?, ?, ?, ?, ?, ?)",
            id,
            batchId,
            ownerId,
            key,
            checksum.lowercase(),
            totalBytes,
        )
        return id
    }

    fun byKey(batchId: UUID, key: String): UploadRow? = jdbc.query(
        "SELECT * FROM import_uploads WHERE batch_id = ? AND idempotency_key = ? AND expires_at > now()",
        ::map,
        batchId,
        key,
    ).firstOrNull()

    fun find(id: UUID, lock: Boolean = false): UploadRow? = jdbc.query(
        "SELECT * FROM import_uploads WHERE id = ? AND expires_at > now()" + if (lock) " FOR UPDATE" else "",
        ::map,
        id,
    ).firstOrNull()

    fun chunkIndices(id: UUID): Set<Int> = jdbc.query(
        "SELECT chunk_index FROM import_upload_chunks WHERE upload_id = ?",
        { rs, _ -> rs.getInt(1) },
        id,
    ).toSet()

    fun chunkChecksum(id: UUID, index: Int): String? = jdbc.query(
        "SELECT checksum_sha256 FROM import_upload_chunks WHERE upload_id = ? AND chunk_index = ?",
        { rs, _ -> rs.getString(1) },
        id,
        index,
    ).firstOrNull()

    fun insertChunk(id: UUID, index: Int, bytes: ByteArray, checksum: String) {
        jdbc.update("INSERT INTO import_upload_chunks (upload_id, chunk_index, bytes, checksum_sha256) VALUES (?, ?, ?, ?)", id, index, bytes, checksum.lowercase())
    }

    fun chunks(id: UUID): List<ByteArray> = jdbc.query(
        "SELECT bytes FROM import_upload_chunks WHERE upload_id = ? ORDER BY chunk_index",
        { rs, _ -> rs.getBytes(1) },
        id,
    )

    fun complete(id: UUID, itemId: UUID) {
        jdbc.update("UPDATE import_uploads SET status = 'completed', import_job_id = ? WHERE id = ? AND status = 'receiving'", itemId, id)
        jdbc.update("DELETE FROM import_upload_chunks WHERE upload_id = ?", id)
    }

    fun cancel(id: UUID) {
        jdbc.update("UPDATE import_uploads SET status = 'canceled' WHERE id = ? AND status = 'receiving'", id)
        jdbc.update("DELETE FROM import_upload_chunks WHERE upload_id = ?", id)
    }

    fun cleanExpired(): Int = jdbc.update("DELETE FROM import_uploads WHERE expires_at <= now()")

    private fun map(rs: java.sql.ResultSet, @Suppress("UNUSED_PARAMETER") index: Int): UploadRow = UploadRow(
        rs.getObject("id", UUID::class.java),
        rs.getObject("batch_id", UUID::class.java),
        rs.getObject("owner_id", UUID::class.java),
        rs.getString("idempotency_key"),
        rs.getString("checksum_sha256").trim(),
        rs.getInt("total_bytes"),
        rs.getString("status"),
        rs.getObject("import_job_id", UUID::class.java),
    )
}

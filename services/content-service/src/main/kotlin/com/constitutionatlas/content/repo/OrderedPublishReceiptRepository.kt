package com.constitutionatlas.content.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

data class OrderedPublishReceipt(val versionId: UUID, val requestHash: String, val generation: Long)

@Repository
class OrderedPublishReceiptRepository(private val jdbc: JdbcTemplate) {
    fun find(attempt: UUID): OrderedPublishReceipt? = jdbc.query("SELECT version_id, request_hash, generation FROM ordered_publish_receipts WHERE attempt_id = ?", { rs, _ -> OrderedPublishReceipt(rs.getObject(1, UUID::class.java), rs.getString(2), rs.getLong(3)) }, attempt).firstOrNull()
    fun forVersion(version: UUID): UUID? = jdbc.query("SELECT attempt_id FROM ordered_publish_receipts WHERE version_id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, version).firstOrNull()
    fun insert(attempt: UUID, version: UUID, hash: String, generation: Long) {
        jdbc.update("INSERT INTO ordered_publish_receipts(attempt_id, version_id, request_hash, generation) VALUES (?, ?, ?, ?)", attempt, version, hash, generation)
    }
}

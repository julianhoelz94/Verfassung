package com.constitutionatlas.catalog.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

data class PublishReservation(val constitutionId: UUID, val versionId: UUID, val requestHash: String)

@Repository
class PublishAttemptRepository(private val jdbc: JdbcTemplate) {
    fun lock(constitution: UUID) {
        jdbc.query("SELECT id FROM constitutions WHERE id = ? FOR UPDATE", { rs, _ -> rs.getObject(1, UUID::class.java) }, constitution)
    }
    fun find(id: UUID): PublishReservation? = jdbc.query("SELECT constitution_id, version_id, request_hash FROM successor_publish_attempts WHERE id = ?", { rs, _ -> PublishReservation(rs.getObject(1, UUID::class.java), rs.getObject(2, UUID::class.java), rs.getString(3)) }, id).firstOrNull()
    fun forVersion(version: UUID): UUID? = jdbc.query("SELECT id FROM successor_publish_attempts WHERE version_id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, version).firstOrNull()
    fun insert(id: UUID, constitution: UUID, version: UUID, hash: String) {
        jdbc.update("INSERT INTO successor_publish_attempts(id, constitution_id, version_id, request_hash) VALUES (?, ?, ?, ?)", id, constitution, version, hash)
    }
}

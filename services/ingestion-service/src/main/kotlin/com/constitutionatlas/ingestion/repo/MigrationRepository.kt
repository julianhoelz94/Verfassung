package com.constitutionatlas.ingestion.repo

import com.constitutionatlas.ingestion.api.CreateMigrationRun
import com.constitutionatlas.ingestion.api.MigrationItem
import com.constitutionatlas.ingestion.api.StageMigrationItem
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
class MigrationRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun lock(key: String) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", { _, _ -> Unit }, key)
    }
    fun create(owner: UUID, request: CreateMigrationRun, hash: String): UUID {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO migration_runs(id, owner_id, run_key, manifest, manifest_sha256) VALUES (?, ?, ?, ?::jsonb, ?)", id, owner, request.runKey, mapper.writeValueAsString(request), hash)
        return id
    }
    fun byKey(owner: UUID, key: String): Pair<UUID, String>? = jdbc.query("SELECT id, manifest_sha256 FROM migration_runs WHERE owner_id = ? AND run_key = ?", { rs, _ -> rs.getObject(1, UUID::class.java) to rs.getString(2) }, owner, key).firstOrNull()
    fun owner(id: UUID): UUID? = jdbc.query("SELECT owner_id FROM migration_runs WHERE id = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, id).firstOrNull()
    fun list(owner: UUID, staff: Boolean): List<UUID> = if (staff) jdbc.query("SELECT id FROM migration_runs ORDER BY created_at DESC, id LIMIT 100", { rs, _ -> rs.getObject(1, UUID::class.java) }) else jdbc.query("SELECT id FROM migration_runs WHERE owner_id = ? ORDER BY created_at DESC, id LIMIT 100", { rs, _ -> rs.getObject(1, UUID::class.java) }, owner)
    fun manifest(id: UUID): CreateMigrationRun = jdbc.queryForObject("SELECT manifest FROM migration_runs WHERE id = ?", { rs, _ -> mapper.readValue(rs.getString(1), CreateMigrationRun::class.java) }, id)!!
    fun items(run: UUID): List<MigrationItem> = jdbc.query("SELECT * FROM migration_items WHERE run_id = ? ORDER BY source_key", { rs, _ ->
        MigrationItem(
            rs.getObject("id", UUID::class.java), rs.getString("source_key"), rs.getString("kind"), rs.getString("request_sha256"),
            mapper.readTree(rs.getString("dependencies")).map { it.asText() }, rs.getString("state"), mapper.readTree(rs.getString("result")), rs.getInt("attempts"), rs.getString("error"),
        )
    }, run)
    fun payload(id: UUID): JsonNode = jdbc.queryForObject("SELECT payload FROM migration_items WHERE id = ?", { rs, _ -> mapper.readTree(rs.getString(1)) }, id)!!
    fun insert(run: UUID, request: StageMigrationItem, hash: String): UUID {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO migration_items(id, run_id, source_key, kind, request_sha256, payload, dependencies) VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)", id, run, request.sourceKey, request.kind, hash, mapper.writeValueAsString(request.payload), mapper.writeValueAsString(request.dependencies))
        return id
    }

    @Transactional
    fun claim(id: UUID, actor: UUID): Int? {
        val number = jdbc.query("UPDATE migration_items SET state = 'preparing', attempts = attempts + 1, error = NULL, updated_at = NOW() WHERE id = ? AND (state IN ('staged', 'blocked', 'failed') OR (state = 'preparing' AND updated_at < NOW() - INTERVAL '2 minutes')) RETURNING attempts", { rs, _ -> rs.getInt(1) }, id).firstOrNull() ?: return null
        jdbc.update("INSERT INTO migration_item_attempts(item_id, attempt_number, actor_id) VALUES (?, ?, ?)", id, number, actor)
        return number
    }

    @Transactional
    fun finishAttempt(id: UUID, number: Int, state: String, result: JsonNode, error: String? = null) {
        jdbc.update("UPDATE migration_item_attempts SET state = ?, error = ?, finished_at = NOW() WHERE item_id = ? AND attempt_number = ?", state, error, id, number)
        jdbc.update("UPDATE migration_items SET state = ?, result = ?::jsonb, error = ?, updated_at = NOW() WHERE id = ? AND state = 'preparing' AND attempts = ?", state, mapper.writeValueAsString(result), error, id, number)
    }
    fun block(id: UUID, error: String) {
        jdbc.update("UPDATE migration_items SET state = 'blocked', error = ? WHERE id = ? AND state IN ('staged', 'blocked', 'failed')", error, id)
    }
    fun attempts(id: UUID, offset: Int, limit: Int): com.constitutionatlas.ingestion.api.MigrationAttemptPage {
        val rows = jdbc.query("SELECT attempt_number, actor_id, state, error, started_at, finished_at FROM migration_item_attempts WHERE item_id = ? ORDER BY attempt_number DESC LIMIT ? OFFSET ?", { rs, _ -> com.constitutionatlas.ingestion.api.MigrationAttempt(rs.getInt(1), rs.getObject(2, UUID::class.java), rs.getString(3), rs.getString(4), rs.getObject(5, java.time.OffsetDateTime::class.java), rs.getObject(6, java.time.OffsetDateTime::class.java)) }, id, limit + 1, offset)
        return com.constitutionatlas.ingestion.api.MigrationAttemptPage(rows.take(limit), if (rows.size > limit) offset + limit else null)
    }
    fun finish(id: UUID, state: String, result: JsonNode, error: String? = null) {
        jdbc.update("UPDATE migration_items SET state = ?, result = ?::jsonb, error = ?, updated_at = NOW() WHERE id = ?", state, mapper.writeValueAsString(result), error, id)
    }
    fun scrubCapture(id: UUID) {
        jdbc.update("UPDATE migration_items SET payload = payload - 'fileBase64' WHERE id = ? AND state = 'prepared'", id)
    }
}

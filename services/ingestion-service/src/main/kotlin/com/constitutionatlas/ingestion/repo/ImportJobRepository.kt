package com.constitutionatlas.ingestion.repo

import com.constitutionatlas.ingestion.api.ImportErrorDto
import com.constitutionatlas.ingestion.api.ImportJobDto
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.api.ReviewDecisionDto
import com.constitutionatlas.platform.OrderedSnapshot
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
class ImportJobRepository(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    private val publicationOutbox: ImportPublicationOutbox,
) {
    fun insertPending(payload: Any, submittedBy: UUID, batchId: UUID? = null, idempotencyKey: String? = null, checksum: String? = null): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO import_jobs (id, status, payload, submitted_by, batch_id, idempotency_key, payload_sha256) VALUES (?, 'pending_review', ?::jsonb, ?, ?, ?, ?)",
            id,
            objectMapper.writeValueAsString(payload),
            submittedBy,
            batchId,
            idempotencyKey,
            checksum,
        )
        return id
    }

    fun createBatch(ownerId: UUID): UUID {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO import_batches (id, owner_id) VALUES (?, ?)", id, ownerId)
        return id
    }

    fun batchOwner(batchId: UUID): UUID? = jdbc.query(
        "SELECT owner_id FROM import_batches WHERE id = ? AND expires_at > NOW()",
        { rs, _ -> rs.getObject("owner_id", UUID::class.java) }, batchId,
    ).firstOrNull()

    fun batchOwnerForUpdate(batchId: UUID): UUID? = jdbc.query(
        "SELECT owner_id FROM import_batches WHERE id = ? AND expires_at > NOW() FOR UPDATE",
        { rs, _ -> rs.getObject("owner_id", UUID::class.java) }, batchId,
    ).firstOrNull()

    fun batchItems(batchId: UUID): List<ImportJobDto> = jdbc.query(
        "SELECT id FROM import_jobs WHERE batch_id = ? ORDER BY created_at, id",
        { rs, _ -> rs.getObject("id", UUID::class.java) }, batchId,
    ).mapNotNull(::find)

    fun findBatchItem(batchId: UUID, idempotencyKey: String): Pair<ImportJobDto, String?>? = jdbc.query(
        "SELECT id, payload_sha256 FROM import_jobs WHERE batch_id = ? AND idempotency_key = ?",
        { rs, _ -> rs.getObject("id", UUID::class.java) to rs.getString("payload_sha256") }, batchId, idempotencyKey,
    ).firstOrNull()?.let { (id, hash) -> find(id)?.let { it to hash } }

    @Transactional
    fun complete(jobId: UUID, versionId: UUID, actorId: UUID) {
        val request = request(jobId) ?: error("Import payload missing")
        val approvedBy = find(jobId)?.approvedBy ?: error("Approved reviewer missing")
        check(jdbc.update(
            "UPDATE import_jobs SET status = 'completed', version_id = ?, published_at = NOW(), updated_at = NOW() WHERE id = ? AND status = 'publishing'",
            versionId, jobId,
        ) == 1) { "Import was not publishing" }
        publicationOutbox.enqueue(jobId, "audit_publish", mapOf(
            "actorId" to actorId, "action" to "import.published", "entityType" to "import_job", "entityId" to jobId,
            "payload" to mapOf(
                "decision" to "approved", "approvedBy" to approvedBy, "sourceUrl" to request.sourceUrl,
                "gazetteReference" to request.gazetteReference, "versionId" to versionId, "outcome" to "published",
            ),
        ))
        publicationOutbox.enqueue(jobId, "search_reindex", mapOf("versionId" to versionId))
    }

    fun claimPreparation(jobId: UUID, actorId: UUID): Boolean = jdbc.update(
        "UPDATE import_jobs SET status = 'preparing', prepared_by = ?, updated_at = NOW() WHERE id = ? AND status = 'pending_review' AND version_id IS NULL",
        actorId, jobId,
    ) == 1

    fun confirmOutline(jobId: UUID, actorId: UUID): Boolean = jdbc.update(
        "UPDATE import_jobs SET outline_confirmed_by = ?, outline_confirmed_at = NOW(), updated_at = NOW() WHERE id = ? AND status = 'pending_review' AND version_id IS NULL",
        actorId, jobId,
    ) == 1

    fun isOutlineConfirmed(jobId: UUID): Boolean = jdbc.query(
        "SELECT outline_confirmed_by IS NOT NULL FROM import_jobs WHERE id = ?",
        { rs, _ -> rs.getBoolean(1) }, jobId,
    ).firstOrNull() ?: false

    fun prepared(jobId: UUID, versionId: UUID) {
        jdbc.update("UPDATE import_jobs SET status = 'pending_review', version_id = ?, updated_at = NOW() WHERE id = ? AND status = 'preparing'", versionId, jobId)
    }

    @Transactional
    fun approve(jobId: UUID, actorId: UUID, snapshot: OrderedSnapshot, reason: String): Boolean {
        val changed = jdbc.update(
            "UPDATE import_jobs SET status = 'approved', approved_by = ?, approved_at = NOW(), approved_generation = ?, approved_settings_revision_id = ?, updated_at = NOW() WHERE id = ? AND status = 'pending_review' AND version_id = ? AND (submitted_by IS NULL OR submitted_by <> ?)",
            actorId, snapshot.generation, snapshot.settingsRevisionId, jobId, snapshot.versionId, actorId,
        ) == 1
        if (changed) recordDecision(jobId, actorId, "approved", reason)
        return changed
    }

    @Transactional
    fun reject(jobId: UUID, actorId: UUID, reason: String): Boolean {
        val changed = jdbc.update(
            "UPDATE import_jobs SET status = 'rejected', approved_by = ?, updated_at = NOW() WHERE id = ? AND status = 'pending_review' AND (submitted_by IS NULL OR submitted_by <> ?)",
            actorId, jobId, actorId,
        ) == 1
        if (changed) recordDecision(jobId, actorId, "rejected", reason)
        return changed
    }

    private fun recordDecision(jobId: UUID, actorId: UUID, decision: String, reason: String) {
        jdbc.update(
            "INSERT INTO import_review_decisions (id, import_job_id, decision, reason, decided_by) VALUES (?, ?, ?, ?, ?)",
            UUID.randomUUID(), jobId, decision, reason, actorId,
        )
    }

    fun reviewDecisions(jobId: UUID): List<ReviewDecisionDto> = jdbc.query(
        "SELECT id, decision, reason, decided_by, decided_at FROM import_review_decisions WHERE import_job_id = ? ORDER BY decided_at, id",
        { rs, _ -> ReviewDecisionDto(rs.getObject("id", UUID::class.java), rs.getString("decision"), rs.getString("reason"), rs.getObject("decided_by", UUID::class.java), rs.getObject("decided_at", java.time.OffsetDateTime::class.java)) },
        jobId,
    )

    fun claimPublication(jobId: UUID, actorId: UUID): Boolean = jdbc.update(
        "UPDATE import_jobs SET status = 'publishing', published_by = ?, updated_at = NOW() WHERE id = ? AND status = 'approved' AND approved_by <> ?",
        actorId, jobId, actorId,
    ) == 1

    fun publishFailed(jobId: UUID) {
        jdbc.update("UPDATE import_jobs SET status = 'approved', published_by = NULL, updated_at = NOW() WHERE id = ? AND status = 'publishing'", jobId)
    }

    fun approvedFingerprint(jobId: UUID): Pair<Long, UUID?>? = jdbc.query(
        "SELECT approved_generation, approved_settings_revision_id FROM import_jobs WHERE id = ? AND approved_generation IS NOT NULL",
        { rs, _ -> rs.getLong("approved_generation") to rs.getObject("approved_settings_revision_id", UUID::class.java) }, jobId,
    ).firstOrNull()

    fun request(jobId: UUID): ImportRequest? = jdbc.query(
        "SELECT payload FROM import_jobs WHERE id = ?",
        { rs, _ -> objectMapper.readValue(rs.getString("payload"), ImportRequest::class.java) }, jobId,
    ).firstOrNull()

    fun submitter(jobId: UUID): UUID? = jdbc.query(
        "SELECT submitted_by FROM import_jobs WHERE id = ?",
        { rs, _ -> rs.getObject("submitted_by", UUID::class.java) }, jobId,
    ).firstOrNull()

    fun list(status: String?, limit: Int = 100): List<ImportJobDto> {
        val ids = if (status == null) jdbc.query(
            "SELECT id FROM import_jobs ORDER BY created_at DESC LIMIT ?",
            { rs, _ -> rs.getObject("id", UUID::class.java) }, limit,
        ) else jdbc.query(
            "SELECT id FROM import_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?",
            { rs, _ -> rs.getObject("id", UUID::class.java) }, status, limit,
        )
        return ids.mapNotNull(::find)
    }

    fun fail(jobId: UUID, errors: List<Pair<String, String>>) {
        jdbc.update(
            "UPDATE import_jobs SET status = 'failed', updated_at = NOW() WHERE id = ?",
            jobId,
        )
        errors.forEach { (code, message) ->
            jdbc.update(
                "INSERT INTO import_errors (id, import_job_id, code, message) VALUES (?, ?, ?, ?)",
                UUID.randomUUID(),
                jobId,
                code,
                message,
            )
        }
    }

    fun stage(jobId: UUID, recordType: String, payload: Any) {
        jdbc.update(
            "INSERT INTO import_staging_records (id, import_job_id, record_type, payload) VALUES (?, ?, ?, ?::jsonb)",
            UUID.randomUUID(),
            jobId,
            recordType,
            objectMapper.writeValueAsString(payload),
        )
    }

    fun find(jobId: UUID): ImportJobDto? {
        val job = jdbc.query(
            "SELECT id, status, version_id, payload, submitted_by, prepared_by, approved_by, published_by, outline_confirmed_by FROM import_jobs WHERE id = ?",
            { rs, _ ->
                val payload = rs.getString("payload")
                val iso =
                    runCatching { objectMapper.readTree(payload).path("isoCode").asText(null) }.getOrNull()
                JobRow(
                    rs.getObject("id", UUID::class.java),
                    rs.getString("status"),
                    rs.getObject("version_id", UUID::class.java),
                    iso?.ifBlank { null },
                    rs.getObject("submitted_by", UUID::class.java),
                    rs.getObject("prepared_by", UUID::class.java),
                    rs.getObject("approved_by", UUID::class.java),
                    rs.getObject("published_by", UUID::class.java),
                    rs.getObject("outline_confirmed_by", UUID::class.java),
                )
            },
            jobId,
        ).firstOrNull() ?: return null
        val errors = jdbc.query(
            "SELECT code, message FROM import_errors WHERE import_job_id = ?",
            { rs, _ -> ImportErrorDto(rs.getString("code"), rs.getString("message")) },
            jobId,
        )
        return ImportJobDto(job.id, job.status, job.versionId, errors, job.isoCode, job.submittedBy, job.preparedBy, job.approvedBy, job.publishedBy, job.outlineConfirmedBy)
    }

    private data class JobRow(
        val id: UUID,
        val status: String,
        val versionId: UUID?,
        val isoCode: String?,
        val submittedBy: UUID?,
        val preparedBy: UUID?,
        val approvedBy: UUID?,
        val publishedBy: UUID?,
        val outlineConfirmedBy: UUID?,
    )
}

package com.constitutionatlas.ingestion.repo

import com.constitutionatlas.ingestion.api.ImportErrorDto
import com.constitutionatlas.ingestion.api.ImportJobDto
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class ImportJobRepository(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun insertRunning(payload: Any): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "INSERT INTO import_jobs (id, status, payload) VALUES (?, 'running', ?::jsonb)",
            id,
            objectMapper.writeValueAsString(payload),
        )
        return id
    }

    fun complete(jobId: UUID, versionId: UUID) {
        jdbc.update(
            "UPDATE import_jobs SET status = 'completed', version_id = ?, updated_at = NOW() WHERE id = ?",
            versionId,
            jobId,
        )
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
            "SELECT id, status, version_id, payload FROM import_jobs WHERE id = ?",
            { rs, _ ->
                val payload = rs.getString("payload")
                val iso =
                    runCatching { objectMapper.readTree(payload).path("isoCode").asText(null) }.getOrNull()
                JobRow(
                    rs.getObject("id", UUID::class.java),
                    rs.getString("status"),
                    rs.getObject("version_id", UUID::class.java),
                    iso?.ifBlank { null },
                )
            },
            jobId,
        ).firstOrNull() ?: return null
        val errors = jdbc.query(
            "SELECT code, message FROM import_errors WHERE import_job_id = ?",
            { rs, _ -> ImportErrorDto(rs.getString("code"), rs.getString("message")) },
            jobId,
        )
        return ImportJobDto(job.id, job.status, job.versionId, errors, job.isoCode)
    }

    private data class JobRow(
        val id: UUID,
        val status: String,
        val versionId: UUID?,
        val isoCode: String?,
    )
}

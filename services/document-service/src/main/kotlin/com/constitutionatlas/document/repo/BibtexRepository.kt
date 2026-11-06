package com.constitutionatlas.document.repo

import com.constitutionatlas.document.api.BibtexImportDto
import com.constitutionatlas.document.api.DocumentConflictException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Repository
class BibtexRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    /** Serialize identical concurrent retries without committing a partial receipt. */
    fun prior(actorId: UUID, operationId: String, hash: String): BibtexImportDto? {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", { _, _ -> true }, "$actorId:$operationId")
        return jdbc.query(
            "SELECT request_hash, result_json::text FROM document_bibtex_import_receipts WHERE actor_id = ? AND operation_id = ?",
            { rs, _ ->
                if (rs.getString("request_hash") != hash) throw DocumentConflictException("The import operation ID was already used with different content")
                mapper.readValue(rs.getString("result_json"), BibtexImportDto::class.java)
            },
            actorId,
            operationId,
        ).firstOrNull()
    }

    fun complete(actorId: UUID, operationId: String, hash: String, result: BibtexImportDto) {
        jdbc.update(
            "INSERT INTO document_bibtex_import_receipts (actor_id, operation_id, request_hash, result_json) VALUES (?, ?, ?, ?::jsonb)",
            actorId,
            operationId,
            hash,
            mapper.writeValueAsString(result),
        )
    }
}

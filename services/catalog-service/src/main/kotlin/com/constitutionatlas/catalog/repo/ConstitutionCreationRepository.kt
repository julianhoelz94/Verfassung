package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.ConstitutionSummary
import com.constitutionatlas.catalog.api.CreateConstitutionRequest
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.security.MessageDigest
import java.util.UUID

@Repository
class ConstitutionCreationRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    /** A transaction-scoped lock also serializes attempts before their receipt exists. */
    fun replay(id: UUID, jurisdictionId: UUID, request: CreateConstitutionRequest): ConstitutionSummary? {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", { _, _ -> Unit }, "constitution-create:$id")
        return jdbc.query(
            "SELECT jurisdiction_id, request_hash, response::text FROM constitution_creation_receipts WHERE id = ?",
            { rs, _ ->
                if (rs.getObject("jurisdiction_id", UUID::class.java) != jurisdictionId || rs.getString("request_hash") != hash(request)) {
                    throw ConflictException("Constitution creation attempt payload changed", "creation_attempt_mismatch")
                }
                mapper.readValue(rs.getString("response"), ConstitutionSummary::class.java)
            },
            id,
        ).firstOrNull()
    }

    fun record(id: UUID, jurisdictionId: UUID, request: CreateConstitutionRequest, response: ConstitutionSummary) {
        jdbc.update(
            "INSERT INTO constitution_creation_receipts(id, jurisdiction_id, constitution_id, request_hash, response) VALUES (?, ?, ?, ?, ?::jsonb)",
            id,
            jurisdictionId,
            response.id,
            hash(request),
            mapper.writeValueAsString(response),
        )
    }

    private fun hash(request: CreateConstitutionRequest): String = MessageDigest.getInstance("SHA-256")
        .digest(mapper.writeValueAsBytes(request)).joinToString("") { "%02x".format(it) }
}

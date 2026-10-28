package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.ConstitutionSummary
import com.constitutionatlas.catalog.api.CreateConstitutionRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
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
                val savedHash = rs.getString("request_hash")
                if (rs.getObject("jurisdiction_id", UUID::class.java) != jurisdictionId || (savedHash != hash(request) && savedHash != legacyHash(request))) {
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

    private fun legacyHash(request: CreateConstitutionRequest): String? {
        if (request.outline?.any { it.sentenceDelimiters != listOf(".", "!", "?") } == true) return null
        // Adding the default delimiter field must not invalidate a previously recorded setup retry.
        val original = mapper.readTree(mapper.writeValueAsBytes(request))
        original.path("outline").forEach { (it as tools.jackson.databind.node.ObjectNode).remove("sentenceDelimiters") }
        return MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(original)).joinToString("") { "%02x".format(it) }
    }
}

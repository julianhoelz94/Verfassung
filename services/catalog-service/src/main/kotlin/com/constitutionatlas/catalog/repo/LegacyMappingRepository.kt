package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.api.LegacyMapping
import com.constitutionatlas.catalog.api.LegacyMappingRequest
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class LegacyMappingRepository(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    fun find(key: String): LegacyMapping? = jdbc.query("SELECT id, source_url, target FROM legacy_archive_mappings WHERE source_key = ?", { rs, _ -> LegacyMapping(rs.getObject(1, UUID::class.java), rs.getString(2), mapper.readValue(rs.getString(3), LegacyMappingRequest::class.java)) }, key).firstOrNull()
    fun lock(key: String) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", { _, _ -> Unit }, key)
    }
    fun insert(key: String, request: LegacyMappingRequest, actor: UUID): LegacyMapping {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO legacy_archive_mappings(id, source_key, source_url, target, created_by) VALUES (?, ?, ?, ?::jsonb, ?)", id, key, request.sourceUrl, mapper.writeValueAsString(request), actor)
        return LegacyMapping(id, request.sourceUrl, request)
    }
}

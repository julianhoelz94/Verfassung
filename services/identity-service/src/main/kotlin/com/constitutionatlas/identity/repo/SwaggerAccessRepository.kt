package com.constitutionatlas.identity.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class SwaggerAccessRepository(private val jdbc: JdbcTemplate) {
    fun enabled(): Boolean = jdbc.queryForObject(
        "SELECT enabled FROM swagger_access_settings WHERE id = TRUE",
        Boolean::class.java,
    )!!

    fun update(enabled: Boolean) {
        jdbc.update("UPDATE swagger_access_settings SET enabled = ?, updated_at = NOW() WHERE id = TRUE", enabled)
    }
}

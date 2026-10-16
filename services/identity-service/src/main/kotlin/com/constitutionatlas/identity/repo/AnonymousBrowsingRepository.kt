package com.constitutionatlas.identity.repo

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

data class AnonymousRate(val requests: Int, val windowValue: Int, val windowUnit: String)

data class AnonymousBrowsingSettings(
    val allowed: Boolean,
    val perIp: AnonymousRate,
    val total: AnonymousRate,
    val revision: Long = 0,
)

@Repository
class AnonymousBrowsingRepository(private val jdbc: JdbcTemplate) {
    fun get(): AnonymousBrowsingSettings = jdbc.queryForObject(
        "SELECT * FROM anonymous_browsing_settings WHERE id = TRUE",
    ) { rs, _ ->
        AnonymousBrowsingSettings(
            rs.getBoolean("allowed"),
            AnonymousRate(rs.getInt("per_ip_requests"), rs.getInt("per_ip_window_value"), rs.getString("per_ip_window_unit")),
            AnonymousRate(rs.getInt("total_requests"), rs.getInt("total_window_value"), rs.getString("total_window_unit")),
            rs.getLong("revision"),
        )
    }!!

    fun update(settings: AnonymousBrowsingSettings) {
        jdbc.update(
            """
            UPDATE anonymous_browsing_settings SET allowed = ?,
              per_ip_requests = ?, per_ip_window_value = ?, per_ip_window_unit = ?,
              total_requests = ?, total_window_value = ?, total_window_unit = ?, revision = revision + 1, updated_at = NOW()
            WHERE id = TRUE
            """.trimIndent(),
            settings.allowed,
            settings.perIp.requests,
            settings.perIp.windowValue,
            settings.perIp.windowUnit,
            settings.total.requests,
            settings.total.windowValue,
            settings.total.windowUnit,
        )
    }
}

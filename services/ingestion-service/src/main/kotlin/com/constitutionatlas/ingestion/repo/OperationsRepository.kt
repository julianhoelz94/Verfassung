package com.constitutionatlas.ingestion.repo

import com.constitutionatlas.ingestion.api.OperationQueueStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class OperationsRepository(private val jdbc: JdbcTemplate) {
    fun queues(): List<OperationQueueStatus> = listOf(
        queue("publication", "import_publication_outbox", "delivered_at IS NULL", "attempts > 0", "created_at"),
        queue("preparing", "import_jobs", "status = 'preparing'", "updated_at < now() - interval '2 minutes'", "updated_at"),
        queue("confirming", "import_setup_proposals", "status = 'confirming'", "confirmation_started_at IS NULL OR confirmation_started_at < now() - interval '2 minutes'", "COALESCE(confirmation_requested_at, updated_at)"),
    )

    // Only fixed service-owned identifiers and predicates are passed here, never caller input.
    private fun queue(name: String, table: String, pending: String, failed: String, timestamp: String): OperationQueueStatus = jdbc.queryForObject(
        "SELECT count(*) AS pending, count(*) FILTER (WHERE $failed) AS failed, GREATEST(0, COALESCE(EXTRACT(EPOCH FROM now() - min($timestamp)), 0))::bigint AS age FROM $table WHERE $pending",
        { rs, _ -> OperationQueueStatus(name, rs.getLong("pending"), rs.getLong("failed"), rs.getLong("age")) },
    )!!
}

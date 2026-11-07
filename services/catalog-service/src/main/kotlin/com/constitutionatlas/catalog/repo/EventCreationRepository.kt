package com.constitutionatlas.catalog.repo

import com.constitutionatlas.catalog.ConflictException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.security.MessageDigest
import java.util.UUID

/** Actor-scoped receipt survives a gateway failure after the event has committed. */
@Repository
class EventCreationRepository(private val jdbc: JdbcTemplate, private val mapper: tools.jackson.databind.ObjectMapper) {
    fun find(actor: UUID, operation: UUID?, kind: String, constitution: UUID, request: Any): UUID? {
        if (operation == null) return null
        jdbc.execute("SELECT pg_advisory_xact_lock(hashtextextended('$actor:$operation', 0))")
        return jdbc.query("SELECT event_id, request_hash FROM event_creation_receipts WHERE actor_id = ? AND operation_id = ?", { rs, _ ->
            if (rs.getString("request_hash") != hash(kind, constitution, request)) throw ConflictException("Creation request changed; retry the original request", "event_creation_conflict")
            rs.getObject("event_id", UUID::class.java)
        }, actor, operation).firstOrNull()
    }
    fun save(actor: UUID, operation: UUID?, kind: String, constitution: UUID, request: Any, event: UUID) {
        if (operation != null) jdbc.update("INSERT INTO event_creation_receipts (actor_id, operation_id, event_id, request_hash) VALUES (?, ?, ?, ?)", actor, operation, event, hash(kind, constitution, request))
    }
    private fun hash(kind: String, constitution: UUID, request: Any) = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(listOf(kind, constitution, request))).joinToString("") { "%02x".format(it) }
}

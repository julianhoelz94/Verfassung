package com.constitutionatlas.document.repo

import com.constitutionatlas.document.api.ImprintDetailsDto
import com.constitutionatlas.document.api.ImprintDetailsStateDto
import com.constitutionatlas.document.api.SaveImprintDetailsRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class ImprintDetailsRepository(private val jdbc: JdbcTemplate) {
    fun state(): ImprintDetailsStateDto {
        val pointers = jdbc.queryForMap("SELECT draft_revision, published_revision FROM legal_imprint_details WHERE id = TRUE")
        return ImprintDetailsStateDto(
            revision((pointers["draft_revision"] as Number).toInt().takeIf { it > 0 }),
            revision((pointers["published_revision"] as Number?)?.toInt()),
        )
    }

    private fun revision(number: Int?): ImprintDetailsDto? {
        if (number == null) return null
        return jdbc.query(
            "SELECT * FROM legal_imprint_detail_revisions WHERE revision = ?",
            { rs, _ ->
                ImprintDetailsDto(
                    rs.getInt("revision"),
                    rs.getString("name"),
                    rs.getString("street_address"),
                    rs.getString("postal_code"),
                    rs.getString("city"),
                    rs.getString("country"),
                    rs.getString("email"),
                )
            },
            number,
        ).firstOrNull()
    }

    fun save(request: SaveImprintDetailsRequest, actorId: UUID): Boolean {
        val changed = jdbc.update(
            "UPDATE legal_imprint_details SET draft_revision = draft_revision + 1 WHERE id = TRUE AND draft_revision = ?",
            request.expectedRevision,
        )
        if (changed != 1) return false
        jdbc.update(
            """INSERT INTO legal_imprint_detail_revisions
               (revision, name, street_address, postal_code, city, country, email, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            request.expectedRevision + 1,
            request.name.trim(),
            request.streetAddress.trim(),
            request.postalCode.trim(),
            request.city.trim(),
            request.country.trim(),
            request.email.trim(),
            actorId,
        )
        return true
    }

    fun publish(expectedRevision: Int): Boolean =
        jdbc.update(
            "UPDATE legal_imprint_details SET published_revision = draft_revision WHERE id = TRUE AND draft_revision = ? AND draft_revision > 0",
            expectedRevision,
        ) == 1
}

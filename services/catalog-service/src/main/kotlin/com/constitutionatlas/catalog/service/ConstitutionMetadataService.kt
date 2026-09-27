package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.platform.NotFoundException
import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

data class ConstitutionMetadata(val revisionId: UUID, val title: String, val slug: String, val predecessorId: UUID?)
data class ConstitutionMetadataWrite(val expectedRevisionId: UUID, val title: String, val slug: String, val retainSlugAlias: Boolean = false) {
    @JsonAnySetter fun rejectUnknown(name: String, value: JsonNode): Unit = throw IllegalArgumentException("'$name' is creation-only or is not constitution metadata")
}

@Service
class ConstitutionMetadataService(private val jdbc: JdbcTemplate) {
    fun get(constitution: UUID): ConstitutionMetadata = jdbc.query(
        "SELECT r.id, r.title, r.slug, r.predecessor_id FROM constitution_metadata_revisions r JOIN constitutions c ON c.metadata_revision_id = r.id WHERE c.id = ?",
        { rs, _ -> ConstitutionMetadata(rs.getObject(1, UUID::class.java), rs.getString(2), rs.getString(3), rs.getObject(4, UUID::class.java)) },
        constitution,
    ).firstOrNull() ?: throw NotFoundException("Unknown constitution metadata")

    fun initialize(constitution: UUID, country: UUID, title: String, slug: String) {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO constitution_metadata_revisions(id, constitution_id, title, slug) VALUES (?, ?, ?, ?)", id, constitution, title, slug)
        jdbc.update("UPDATE constitutions SET metadata_revision_id = ? WHERE id = ?", id, constitution)
        jdbc.update("INSERT INTO constitution_slug_aliases(country_id, slug, constitution_id) VALUES (?, ?, ?)", country, slug, constitution)
    }

    @Transactional
    fun save(constitution: UUID, request: ConstitutionMetadataWrite): ConstitutionMetadata {
        val country = jdbc.query("SELECT country_id FROM constitutions WHERE id = ? FOR UPDATE", { rs, _ -> rs.getObject(1, UUID::class.java) }, constitution).firstOrNull()
            ?: throw NotFoundException("Unknown constitution")
        val current = get(constitution)
        if (current.revisionId != request.expectedRevisionId) throw ConflictException("Metadata changed; reload", "stale_metadata")
        val title = request.title.trim()
        val slug = request.slug.trim()
        require(title.isNotBlank() && Regex("^[a-z0-9]+(?:-[a-z0-9]+)*$").matches(slug)) { "Title and a valid lowercase slug are required" }
        if (slug != current.slug && !request.retainSlugAlias) throw ConflictException("Slug changes require permanent aliases", "slug_alias_required")
        val reserved = jdbc.query("SELECT constitution_id FROM constitution_slug_aliases WHERE country_id = ? AND slug = ?", { rs, _ -> rs.getObject(1, UUID::class.java) }, country, slug).firstOrNull()
        if (reserved != null && reserved != constitution) throw ConflictException("Slug is already reserved", "slug_reserved")
        jdbc.update("INSERT INTO constitution_slug_aliases(country_id, slug, constitution_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", country, slug, constitution)
        val owner = jdbc.queryForObject("SELECT constitution_id FROM constitution_slug_aliases WHERE country_id = ? AND slug = ?", UUID::class.java, country, slug)
        if (owner != constitution) throw ConflictException("Slug is already reserved", "slug_reserved")
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO constitution_metadata_revisions(id, constitution_id, predecessor_id, title, slug) VALUES (?, ?, ?, ?, ?)", id, constitution, current.revisionId, title, slug)
        jdbc.update("UPDATE constitutions SET title = ?, slug = ?, metadata_revision_id = ? WHERE id = ?", title, slug, id, constitution)
        return get(constitution)
    }
}

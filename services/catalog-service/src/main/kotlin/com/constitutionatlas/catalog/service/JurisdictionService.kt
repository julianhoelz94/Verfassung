package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.CreateCountryRequest
import com.constitutionatlas.catalog.api.CreateJurisdictionRequest
import com.constitutionatlas.catalog.api.JurisdictionDetail
import com.constitutionatlas.catalog.api.JurisdictionSummary
import com.constitutionatlas.catalog.repo.JurisdictionRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class JurisdictionService(
    private val jurisdictions: JurisdictionRepository,
    private val queries: CatalogQueryService,
    private val writes: CatalogWriteService,
) {
    fun list(parentId: UUID?): List<JurisdictionSummary> {
        if (parentId != null) requireJurisdiction(parentId)
        return jurisdictions.children(parentId)
    }

    fun get(id: UUID, includeUnpublished: Boolean = false): JurisdictionDetail = JurisdictionDetail(
        requireJurisdiction(id),
        jurisdictions.ancestors(id),
        jurisdictions.children(id),
        queries.constitutions(id, includeUnpublished),
    )

    @Transactional
    fun create(request: CreateJurisdictionRequest): JurisdictionSummary {
        val slug = request.slug.trim()
        val name = request.name.trim()
        val kind = request.kind.trim().lowercase()
        val code = request.code?.trim()?.uppercase()
        require(Regex("^[a-z0-9]+(?:-[a-z0-9]+)*$").matches(slug)) { "A lowercase jurisdiction slug is required" }
        require(name.isNotBlank()) { "Jurisdiction name is required" }
        require(Regex("^[a-z][a-z0-9_]{0,31}$").matches(kind)) { "A valid jurisdiction kind is required" }
        require(code == null || Regex("^[A-Z0-9][A-Z0-9._-]{0,31}$").matches(code)) { "Invalid jurisdiction code" }
        require(request.existedFrom == null || request.existedUntil == null || !request.existedUntil.isBefore(request.existedFrom)) { "Existence end must not precede its start" }
        require(request.existedUntil == null || request.historical) { "An existence end requires a historical jurisdiction" }
        if (request.parentId != null) requireJurisdiction(request.parentId)
        if (kind == "country") {
            require(request.parentId == null) { "Countries cannot have a parent jurisdiction" }
        }
        try {
            if (kind == "country" && !request.historical && code != null && Regex("^[A-Z]{2}$").matches(code) && slug == code.lowercase()) {
                val country = writes.createCountry(CreateCountryRequest(code, name))
                jurisdictions.setExistenceDates(country.id, request.existedFrom)
                return requireJurisdiction(country.id)
            }
            return jurisdictions.insert(request.parentId, slug, name, kind, code, request.historical, request.existedFrom, request.existedUntil)
        } catch (_: DuplicateKeyException) {
            throw ConflictException("Jurisdiction slug or code already exists under this parent", "jurisdiction_exists")
        }
    }

    private fun requireJurisdiction(id: UUID): JurisdictionSummary = jurisdictions.find(id)
        ?: throw NotFoundException("Unknown jurisdiction '$id'")
}

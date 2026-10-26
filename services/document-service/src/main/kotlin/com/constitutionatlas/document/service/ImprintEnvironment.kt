package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.ImprintDetailsDto
import com.constitutionatlas.document.api.SaveImprintDetailsRequest
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component

@Component
class ImprintEnvironment(private val environment: Environment) {
    private val variables = mapOf(
        "name" to "IMPRINT_NAME",
        "streetAddress" to "IMPRINT_STREET_ADDRESS",
        "postalCode" to "IMPRINT_POSTAL_CODE",
        "city" to "IMPRINT_CITY",
        "country" to "IMPRINT_COUNTRY",
        "email" to "IMPRINT_EMAIL",
    )
    fun managedFields(): List<String> = variables.keys.filter { value(it) != null }
    private fun value(field: String): String? = environment.getProperty(variables.getValue(field))?.trim()?.takeIf { it.isNotBlank() }
    fun draft(saved: ImprintDetailsDto?): ImprintDetailsDto? {
        if (saved == null && managedFields().isEmpty()) return null
        return ImprintDetailsDto(
            saved?.revision ?: 0,
            value("name") ?: saved?.name.orEmpty(),
            value("streetAddress") ?: saved?.streetAddress.orEmpty(),
            value("postalCode") ?: saved?.postalCode.orEmpty(),
            value("city") ?: saved?.city.orEmpty(),
            value("country") ?: saved?.country.orEmpty(),
            value("email") ?: saved?.email.orEmpty(),
        )
    }
    fun request(request: SaveImprintDetailsRequest): SaveImprintDetailsRequest = request.copy(
        name = value("name") ?: request.name,
        streetAddress = value("streetAddress") ?: request.streetAddress,
        postalCode = value("postalCode") ?: request.postalCode,
        city = value("city") ?: request.city,
        country = value("country") ?: request.country,
        email = value("email") ?: request.email,
    )
}

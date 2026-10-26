package com.constitutionatlas.amendment.api

import com.constitutionatlas.amendment.service.AmendmentRegisterService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.util.UUID

@RestController
class AmendmentRegisterController(private val register: AmendmentRegisterService) {
    @GetMapping("/constitutions/{id}/amendment-register")
    fun get(
        @PathVariable id: UUID,
        @RequestParam(defaultValue = "") q: String,
        @RequestParam(required = false) unit: String?,
        @RequestParam(required = false) from: LocalDate?,
        @RequestParam(required = false) until: LocalDate?,
        @RequestParam(defaultValue = "instrument") dateKind: String,
        @RequestParam(defaultValue = "0") offset: Int,
        @RequestParam(defaultValue = "20") limit: Int,
    ) = register.search(id, q, unit, from, until, dateKind, offset, limit)
}

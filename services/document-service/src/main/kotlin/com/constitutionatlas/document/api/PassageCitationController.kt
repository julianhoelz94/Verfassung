package com.constitutionatlas.document.api

import com.constitutionatlas.document.service.PassageCitationService
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class SynchronizeCitations(val generation: Long)

@RestController
class PassageCitationController(private val citations: PassageCitationService) {
    @PostMapping("/versions/{version}/citations/synchronize")
    fun synchronize(@PathVariable version: UUID, @RequestBody request: SynchronizeCitations, @RequestHeader(value = "Authorization", required = false) authorization: String?): Map<String, Boolean> {
        citations.synchronize(version, request.generation, authorization)
        return mapOf("synchronized" to true)
    }
}

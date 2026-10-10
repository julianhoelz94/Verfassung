package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.McpKeyService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class McpKeyController(private val keys: McpKeyService) {
    @GetMapping("/mcp-keys")
    fun list(@RequestHeader(value = "Authorization", required = false) authorization: String?): List<McpKeyDto> =
        keys.list(authorization)

    @PostMapping("/mcp-keys")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: CreateMcpKeyRequest,
        http: HttpServletRequest,
    ): McpKeyCreatedDto = keys.create(authorization, request, http.remoteAddr, http.getHeader("User-Agent"))

    @PostMapping("/mcp-keys/{id}/rotate")
    fun rotate(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: UUID,
        http: HttpServletRequest,
    ): McpKeyCreatedDto = keys.rotate(authorization, id, http.remoteAddr, http.getHeader("User-Agent"))

    @DeleteMapping("/mcp-keys/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revoke(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable id: UUID,
        http: HttpServletRequest,
    ) = keys.revoke(authorization, id, http.remoteAddr, http.getHeader("User-Agent"))
}

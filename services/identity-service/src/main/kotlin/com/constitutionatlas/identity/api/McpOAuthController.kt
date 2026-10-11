package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.McpOAuthService
import com.constitutionatlas.identity.service.McpOAuthToken
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

data class OAuthRegistrationRequest(val client_name: String, val redirect_uris: List<String>, val token_endpoint_auth_method: String = "none")
data class OAuthApprovalRequest(
    val client_id: String,
    val redirect_uri: String,
    val resource: String,
    val response_type: String,
    val code_challenge: String,
    val code_challenge_method: String,
    val scope: String,
    val state: String? = null,
)

@RestController
class McpOAuthController(private val oauth: McpOAuthService) {
    @GetMapping("/.well-known/oauth-authorization-server")
    fun metadata(): Map<String, Any> = mapOf(
        "issuer" to oauth.issuer,
        "authorization_endpoint" to "${oauth.issuer}/oauth/authorize",
        "token_endpoint" to "${oauth.issuer}/oauth/token",
        "registration_endpoint" to "${oauth.issuer}/oauth/register",
        "revocation_endpoint" to "${oauth.issuer}/oauth/revoke",
        "response_types_supported" to listOf("code"),
        "grant_types_supported" to listOf("authorization_code"),
        "code_challenge_methods_supported" to listOf("S256"),
        "token_endpoint_auth_methods_supported" to listOf("none"),
        "scopes_supported" to listOf("mcp:read", "ingestion:import"),
    )

    @PostMapping("/oauth/register")
    fun register(@RequestBody request: OAuthRegistrationRequest): ResponseEntity<Map<String, Any>> {
        if (request.token_endpoint_auth_method != "none") return ResponseEntity.badRequest().body(mapOf("error" to "invalid_client_metadata"))
        val client = oauth.register(request.client_name, request.redirect_uris)
        return ResponseEntity.status(HttpStatus.CREATED).body(
            mapOf(
                "client_id" to client.id.toString(),
                "client_name" to client.name,
                "redirect_uris" to client.redirectUris,
                "token_endpoint_auth_method" to "none",
            ),
        )
    }

    @GetMapping("/oauth/clients/{id}")
    fun client(@PathVariable id: String, @RequestParam redirect_uri: String, @RequestParam resource: String): Map<String, Any> {
        val client = oauth.client(id, redirect_uri, resource)
        return mapOf("client_name" to client.name, "redirect_uri" to redirect_uri)
    }

    @PostMapping("/oauth/approve")
    fun approve(@RequestHeader(HttpHeaders.AUTHORIZATION, required = false) authorization: String?, @RequestBody request: OAuthApprovalRequest): Map<String, String> =
        mapOf("redirect_uri" to oauth.authorize(authorization, request.client_id, request.redirect_uri, request.resource, request.response_type, request.code_challenge, request.code_challenge_method, request.scope, request.state))

    @PostMapping("/oauth/token", consumes = [MediaType.APPLICATION_FORM_URLENCODED_VALUE])
    fun token(
        @RequestParam grant_type: String,
        @RequestParam code: String,
        @RequestParam client_id: String,
        @RequestParam redirect_uri: String,
        @RequestParam code_verifier: String,
        @RequestParam resource: String,
    ): ResponseEntity<McpOAuthToken> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(oauth.redeem(grant_type, code, client_id, redirect_uri, code_verifier, resource))

    @PostMapping("/oauth/revoke", consumes = [MediaType.APPLICATION_FORM_URLENCODED_VALUE])
    fun revoke(@RequestParam token: String): ResponseEntity<Void> {
        oauth.revoke(token)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).build()
    }
}

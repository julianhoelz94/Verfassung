package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.TooManyRequestsException
import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.OAuthClient
import com.constitutionatlas.identity.repo.OAuthCode
import com.constitutionatlas.identity.repo.OAuthGrant
import com.constitutionatlas.identity.repo.OAuthRepository
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.UnauthorizedException
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Base64
import java.util.UUID

data class McpOAuthToken(val access_token: String, val token_type: String = "Bearer", val expires_in: Int = 900, val scope: String)

@Service
class McpOAuthService(
    private val oauth: OAuthRepository,
    private val identities: IdentityRepository,
    private val auth: AuthService,
    @Value("\${PUBLIC_BASE_URL:http://localhost}") private val publicBaseUrl: String,
) {
    private val random = SecureRandom()
    val issuer: String get() = publicBaseUrl.trimEnd('/')
    val resource: String get() = "$issuer/mcp"

    @Transactional
    fun register(name: String, redirectUris: List<String>, clientIp: String): OAuthClient {
        if (name.trim().length !in 1..100 || redirectUris.isEmpty() || redirectUris.size > 5 || redirectUris.distinct().size != redirectUris.size) {
            throw BadRequestException("Invalid OAuth client registration")
        }
        redirectUris.forEach(::validateRedirect)
        if (!oauth.reserveRegistration(Tokens.sha256Hex(clientIp))) throw TooManyRequestsException("OAuth registration limit reached; retry in an hour")
        return oauth.registerClient(name.trim(), redirectUris)
    }

    fun client(clientId: String, redirectUri: String, requestedResource: String): OAuthClient {
        if (requestedResource != resource) throw BadRequestException("Invalid MCP resource")
        val client = oauth.client(parseClientId(clientId)) ?: throw BadRequestException("Unknown OAuth client")
        if (redirectUri !in client.redirectUris) throw BadRequestException("Unregistered redirect URI")
        return client
    }

    @Transactional
    fun authorize(
        authorization: String?,
        clientId: String,
        redirectUri: String,
        requestedResource: String,
        responseType: String,
        codeChallenge: String,
        codeChallengeMethod: String,
        scope: String,
        state: String?,
    ): String {
        val client = client(clientId, redirectUri, requestedResource)
        if (responseType != "code" || codeChallengeMethod != "S256" || !codeChallenge.matches(Regex("[A-Za-z0-9_-]{43,128}"))) {
            throw BadRequestException("Authorization code with PKCE S256 is required")
        }
        if (state != null && state.length > 512) throw BadRequestException("OAuth state is too long")
        val scopes = scope.split(' ').filter { it.isNotBlank() }.distinct()
        if ("mcp:read" !in scopes || scopes.any { it !in setOf("mcp:read", "ingestion:import") }) throw BadRequestException("Invalid MCP scope")
        val owner = auth.requireLockedSession(authorization)
        if ("ingestion:import" in scopes) {
            if (identities.rolesForUser(owner.id).none { it == "editor" || it == "admin" }) throw ForbiddenException("Editor role required")
            auth.requireFreshStepUp(authorization)
        }
        val code = Tokens.urlToken(random)
        oauth.storeCode(OAuthCode(Tokens.sha256Hex(code), client.id, owner.id, redirectUri, resource, scopes, codeChallenge), OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5))
        val separator = if ('?' in redirectUri) '&' else '?'
        val encodedState = state?.let { "&state=${URLEncoder.encode(it, StandardCharsets.UTF_8)}" }.orEmpty()
        return "$redirectUri${separator}code=${URLEncoder.encode(code, StandardCharsets.UTF_8)}$encodedState"
    }

    @Transactional
    fun redeem(grantType: String, code: String, clientId: String, redirectUri: String, codeVerifier: String, requestedResource: String): McpOAuthToken {
        if (grantType != "authorization_code" || requestedResource != resource || !codeVerifier.matches(Regex("[A-Za-z0-9._~-]{43,128}"))) {
            throw BadRequestException("Invalid OAuth token request")
        }
        val stored = oauth.validCode(Tokens.sha256Hex(code)) ?: throw UnauthorizedException("Invalid authorization code")
        identities.lockUser(stored.ownerId)?.takeIf { it.enabled } ?: throw UnauthorizedException("Invalid authorization code")
        if (oauth.validCode(stored.codeHash) == null) throw UnauthorizedException("Invalid authorization code")
        if (stored.clientId != parseClientId(clientId) || stored.redirectUri != redirectUri || stored.resource != requestedResource) {
            throw UnauthorizedException("Invalid authorization code")
        }
        val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(codeVerifier.toByteArray(StandardCharsets.US_ASCII)))
        if (!MessageDigest.isEqual(challenge.toByteArray(StandardCharsets.US_ASCII), stored.codeChallenge.toByteArray(StandardCharsets.US_ASCII))) {
            throw UnauthorizedException("Invalid PKCE verifier")
        }
        if (!oauth.consumeCode(stored.codeHash)) throw UnauthorizedException("Authorization code was already used")
        val token = "ca_oauth_${Tokens.urlToken(random)}"
        oauth.storeToken(Tokens.sha256Hex(token), stored, OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(15))
        return McpOAuthToken(token, scope = stored.scopes.joinToString(" "))
    }

    fun revoke(token: String) = oauth.revokeToken(Tokens.sha256Hex(token))

    fun grants(authorization: String?): List<OAuthGrant> = oauth.activeGrants(auth.requireSession(authorization).id)

    @Transactional
    fun revokeGrant(authorization: String?, clientId: UUID) = oauth.revokeGrant(auth.requireLockedSession(authorization).id, clientId)

    private fun parseClientId(value: String): UUID = try {
        UUID.fromString(value)
    } catch (_: IllegalArgumentException) {
        throw BadRequestException("Invalid OAuth client ID")
    }

    private fun validateRedirect(value: String) {
        if (value.length > 2048 || '*' in value) throw BadRequestException("Invalid redirect URI")
        val uri = try {
            URI(value)
        } catch (_: Exception) {
            throw BadRequestException("Invalid redirect URI")
        }
        val loopback = uri.scheme == "http" && uri.host in setOf("localhost", "127.0.0.1", "[::1]", "::1")
        if (!uri.isAbsolute || uri.host.isNullOrBlank() || uri.rawUserInfo != null || uri.rawFragment != null || (uri.scheme != "https" && !loopback)) {
            throw BadRequestException("Redirect URI must use HTTPS or loopback HTTP")
        }
    }
}

package com.constitutionatlas.audit.client

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

class UnauthorizedException(message: String) : RuntimeException(message)

class ForbiddenException(message: String) : RuntimeException(message)

data class Actor(
    val id: UUID,
    val email: String,
    val roles: List<String>,
    val scopes: List<String> = emptyList(),
)

fun Actor.canAppendAudit(): Boolean =
    "admin" in roles || "editor" in roles || "audit:append" in scopes

interface IdentityClient {
    fun authenticate(authorizationHeader: String?): Actor
}

data class IdentityUserWire(
    val id: UUID,
    val email: String,
    val roles: List<String> = emptyList(),
    val scopes: List<String> = emptyList(),
)

class RestIdentityClient(
    identityUrl: String,
) : IdentityClient {
    private val client: RestClient = RestClient.builder().baseUrl(identityUrl).build()

    override fun authenticate(authorizationHeader: String?): Actor {
        if (authorizationHeader.isNullOrBlank()) {
            throw UnauthorizedException("Missing session")
        }
        val user =
            try {
                client.get()
                    .uri("/me")
                    .header("Authorization", authorizationHeader)
                    .retrieve()
                    .body(IdentityUserWire::class.java)
            } catch (ex: RestClientResponseException) {
                if (ex.statusCode == HttpStatus.UNAUTHORIZED || ex.statusCode == HttpStatus.NOT_FOUND) {
                    throw UnauthorizedException("Invalid session")
                }
                throw ex
            } ?: throw UnauthorizedException("Invalid session")
        return Actor(user.id, user.email, user.roles, user.scopes)
    }
}

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun requireAuditAppender(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canAppendAudit()) {
            throw ForbiddenException("audit append requires editor, admin, or audit:append")
        }
        return actor
    }
}

@Configuration
class IdentityClientConfig {
    @Bean
    @ConditionalOnMissingBean(IdentityClient::class)
    fun identityClient(@Value("\${identity.api.url}") identityUrl: String): IdentityClient =
        RestIdentityClient(identityUrl)
}

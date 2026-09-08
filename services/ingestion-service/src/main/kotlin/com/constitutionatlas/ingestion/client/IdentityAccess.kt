package com.constitutionatlas.ingestion.client

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

fun Actor.canImport(): Boolean = "admin" in roles || "ingestion:import" in scopes

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
    private val client: RestClient = timedRestClient(identityUrl)

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
    fun requireImporter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canImport()) {
            throw ForbiddenException("import requires admin or ingestion:import")
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

object DownstreamAuth {
    private val holder = ThreadLocal<String?>()

    fun <T> withAuthorization(authorization: String?, block: () -> T): T {
        holder.set(authorization)
        return try {
            block()
        } finally {
            holder.remove()
        }
    }

    fun header(): String? = holder.get()
}

package com.constitutionatlas.platform

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.util.UUID

data class Actor(
    val id: UUID,
    val email: String,
    val roles: List<String>,
    val scopes: List<String> = emptyList(),
    val stepUpFresh: Boolean = false,
)

interface IdentityClient {
    fun authenticate(authorizationHeader: String?): Actor
}

data class IdentityUserWire(
    val id: UUID,
    val email: String,
    val roles: List<String> = emptyList(),
    val scopes: List<String> = emptyList(),
    val stepUpFresh: Boolean = false,
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
        return Actor(user.id, user.email, user.roles, user.scopes, user.stepUpFresh)
    }
}

@Configuration
@ConditionalOnProperty("identity.api.url")
class IdentityClientConfig {
    @Bean
    @ConditionalOnMissingBean(IdentityClient::class)
    fun identityClient(@Value("\${identity.api.url}") identityUrl: String): IdentityClient =
        RestIdentityClient(identityUrl)
}

package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.ForbiddenException
import com.constitutionatlas.editor.UnauthorizedException
import com.constitutionatlas.editor.api.Actor
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException

class RestIdentityClient(
    identityUrl: String,
) : IdentityClient {
    private val client: RestClient = RestClient.builder().baseUrl(identityUrl).build()

    override fun authenticate(authorizationHeader: String?): Actor {
        if (authorizationHeader.isNullOrBlank()) {
            throw UnauthorizedException("Missing session")
        }
        val user = try {
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
        val editorial = setOf("admin", "editor", "reviewer", "publisher")
        if (user.roles.none { it in editorial }) {
            throw ForbiddenException("Editorial role required")
        }
        return Actor(user.id, user.email, user.roles)
    }
}

@Configuration
class IdentityClientConfig {
    @Bean
    @ConditionalOnMissingBean(IdentityClient::class)
    fun identityClient(@Value("\${identity.api.url}") identityUrl: String): IdentityClient =
        RestIdentityClient(identityUrl)
}

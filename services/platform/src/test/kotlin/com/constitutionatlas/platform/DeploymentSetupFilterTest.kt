package com.constitutionatlas.platform

import jakarta.servlet.FilterChain
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.test.web.client.ExpectedCount
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withStatus
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient
import java.util.UUID

class DeploymentSetupFilterTest {
    private val builder = RestClient.builder().baseUrl("http://identity")
    private val server = MockRestServiceServer.bindTo(builder).build()
    private var actor = Actor(UUID.randomUUID(), "admin@example.test", listOf("admin"))
    private var authenticationFailure: RuntimeException? = null
    private val filter = DeploymentSetupFilter(
        builder.build(),
        object : IdentityClient {
            override fun authenticate(authorizationHeader: String?): Actor {
                authenticationFailure?.let { throw it }
                return actor
            }
        },
    )

    @Test
    fun `completed setup passes downstream failures through unchanged`() {
        setup(completed = true)
        val failure = IllegalStateException("application failure")
        val response = MockHttpServletResponse()
        val thrown = assertThrows(IllegalStateException::class.java) {
            filter.doFilter(MockHttpServletRequest("GET", "/countries"), response, FilterChain { _, _ -> throw failure })
        }
        assertSame(failure, thrown)
        assertEquals("", response.contentAsString)
        server.verify()
    }

    @Test
    fun `incomplete setup blocks ordinary reads without invoking application`() {
        setup(completed = false)
        val (response, called) = request("GET", "/countries")
        assertEquals(403, response.status)
        assertFalse(called)
        assertEquals("no-store", response.getHeader("Cache-Control"))
        server.verify()
    }

    @Test
    fun `identity outage fails closed`() {
        server.expect(requestTo("http://identity/setup/status")).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE))
        val (response, called) = request("GET", "/countries")
        assertEquals(503, response.status)
        assertFalse(called)
        server.verify()
    }

    @Test
    fun `public legal reads and human admin legal edits remain available during setup`() {
        setup(completed = false, requests = 2)
        assertTrue(request("GET", "/legal-pages/impressum").second)
        assertTrue(request("PUT", "/legal-pages/impressum/draft").second)
        server.verify()
    }

    @Test
    fun `machine keys and invalid sessions cannot edit legal pages during setup`() {
        setup(completed = false, requests = 2)
        actor = actor.copy(scopes = listOf("ingestion:import"))
        assertEquals(403, request("PUT", "/legal-pages/impressum/draft").first.status)
        authenticationFailure = UnauthorizedException("Invalid session")
        assertEquals(403, request("PUT", "/legal-pages/impressum/draft").first.status)
        server.verify()
    }

    @Test
    fun `health probes do not depend on setup availability`() {
        assertTrue(request("GET", "/actuator/health").second)
        assertTrue(request("GET", "/internal/ping").second)
        server.verify()
    }

    private fun setup(completed: Boolean, requests: Int = 1) {
        server.expect(ExpectedCount.times(requests), requestTo("http://identity/setup/status"))
            .andRespond(withSuccess("{\"completed\":$completed,\"other\":true}", MediaType.APPLICATION_JSON))
    }

    private fun request(method: String, path: String): Pair<MockHttpServletResponse, Boolean> {
        val response = MockHttpServletResponse()
        var called = false
        filter.doFilter(MockHttpServletRequest(method, path), response, FilterChain { _, _ -> called = true })
        return response to called
    }
}

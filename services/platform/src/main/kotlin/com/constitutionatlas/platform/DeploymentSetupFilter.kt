package com.constitutionatlas.platform

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.client.RestClient
import org.springframework.web.filter.OncePerRequestFilter

/** Blocks direct service access until bootstrap completes, including internal HTTP callers. */
class DeploymentSetupFilter(
    private val identity: RestClient,
    private val identityClient: IdentityClient,
) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        if (request.requestURI in HEALTH_PATHS) {
            chain.doFilter(request, response)
            return
        }
        val allowed = try {
            mayProceed(request)
        } catch (_: UnauthorizedException) {
            false
        } catch (_: ForbiddenException) {
            false
        } catch (_: Exception) {
            reject(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE)
            return
        }
        if (!allowed) {
            reject(response, HttpServletResponse.SC_FORBIDDEN)
            return
        }
        // Application exceptions belong to the downstream handler. Catching them here
        // would misreport ordinary failures as an unavailable deployment setup.
        chain.doFilter(request, response)
    }

    private fun mayProceed(request: HttpServletRequest): Boolean {
        if (identity.get().uri("/setup/status").retrieve().body(SetupStatus::class.java)?.completed == true) {
            return true
        }
        val path = request.requestURI
        if (!LEGAL_PATH.matches(path)) return false
        if (request.method == "GET" && !path.contains("/editor")) return true
        val actor = identityClient.authenticate(request.getHeader("Authorization"))
        return "admin" in actor.roles && actor.scopes.isEmpty()
    }

    private fun reject(response: HttpServletResponse, status: Int) {
        response.status = status
        response.contentType = "application/json"
        response.setHeader("Cache-Control", "no-store")
        response.writer.write("{\"code\":\"setup_required\",\"detail\":\"Deployment setup is unavailable or incomplete\"}")
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private data class SetupStatus(val completed: Boolean = false)

    companion object {
        private val HEALTH_PATHS = setOf("/internal/ping", "/actuator/health")
        private val LEGAL_PATH = Regex("/legal-pages/(imprint-details|impressum|datenschutz|impressum_en|datenschutz_en)(/editor(/revisions)?|/draft|/publish)?")
    }
}

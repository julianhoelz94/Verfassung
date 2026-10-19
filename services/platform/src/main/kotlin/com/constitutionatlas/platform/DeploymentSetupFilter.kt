package com.constitutionatlas.platform

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.client.RestClient
import org.springframework.web.filter.OncePerRequestFilter

/** Public services must not leak content through direct internal URLs during bootstrap. */
class DeploymentSetupFilter(identityUrl: String, private val identityClient: IdentityClient) : OncePerRequestFilter() {
    private val identity: RestClient = timedRestClient(identityUrl)

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val path = request.requestURI
        if (path in setOf("/internal/ping", "/actuator/health")) {
            chain.doFilter(request, response)
            return
        }
        try {
            val state = identity.get().uri("/setup/status").retrieve().body(Map::class.java)
            if (state?.get("completed") == true) {
                chain.doFilter(request, response)
                return
            }
            val legal = path.matches(Regex("/legal-pages/(imprint-details|impressum|datenschutz|impressum_en|datenschutz_en)(/editor(/revisions)?|/draft|/publish)?"))
            if (legal) {
                if (request.method == "GET" && !path.contains("/editor")) {
                    chain.doFilter(request, response)
                    return
                }
                val actor = identityClient.authenticate(request.getHeader("Authorization"))
                if ("admin" in actor.roles && actor.scopes.isEmpty()) {
                    chain.doFilter(request, response)
                    return
                }
            }
            response.status = 403
        } catch (_: Exception) {
            response.status = 503
        }
        response.contentType = "application/json"
        response.setHeader("Cache-Control", "no-store")
        response.writer.write("{\"code\":\"setup_required\",\"detail\":\"Deployment setup is unavailable or incomplete\"}")
    }
}

package com.constitutionatlas.identity.setup

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class SetupAccessFilter(private val repository: SetupRepository) : OncePerRequestFilter() {
    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val path = request.requestURI
        val allowed = path in setOf(
            "/internal/ping", "/actuator/health", "/setup/status", "/site/languages", "/me", "/login", "/login/mfa", "/logout",
            "/mfa/enroll/start", "/mfa/enroll/confirm", "/mfa/step-up", "/admin/settings", "/admin/settings/test-mail", "/admin/anonymous-browsing",
            "/anonymous-browsing", "/registration/status", "/setup", "/setup/complete",
        )
        if (!allowed && repository.get().completedAt == null) {
            response.status = 403
            response.contentType = "application/json"
            response.setHeader("Cache-Control", "no-store")
            response.writer.write("{\"code\":\"setup_required\",\"error\":\"Deployment setup is incomplete\"}")
            return
        }
        chain.doFilter(request, response)
    }
}

package com.constitutionatlas.identity.api

import jakarta.servlet.http.HttpServletRequest

/** Caddy replaces this header with its trusted peer; never infer identity from raw forwarding chains. */
internal fun clientIp(request: HttpServletRequest): String =
    request.getHeader("X-Atlas-Client-IP")?.trim()?.ifBlank { null }
        ?: request.remoteAddr ?: "unknown"

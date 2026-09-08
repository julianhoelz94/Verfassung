package com.constitutionatlas.audit.client

import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import org.springframework.stereotype.Component

fun Actor.canAppendAudit(): Boolean =
    "admin" in roles || "editor" in roles || "audit:append" in scopes

fun Actor.canReadAudit(): Boolean =
    "admin" in roles || "audit:read" in scopes

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun requireAuditAppender(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canAppendAudit()) {
            throw ForbiddenException("audit append requires editor, admin, or audit:append")
        }
        return actor
    }

    fun requireAuditReader(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canReadAudit()) {
            throw ForbiddenException("audit read requires admin or audit:read")
        }
        return actor
    }
}

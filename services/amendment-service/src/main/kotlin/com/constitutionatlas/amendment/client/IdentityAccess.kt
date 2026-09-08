package com.constitutionatlas.amendment.client

import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import org.springframework.stereotype.Component

fun Actor.canWriteAmendments(): Boolean =
    "admin" in roles ||
        "editor" in roles ||
        "publisher" in roles ||
        "content:write" in scopes ||
        "amendment:write" in scopes

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun requireAmendmentWriter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canWriteAmendments()) {
            throw ForbiddenException("amendment write requires editor, publisher, admin, or content:write")
        }
        return actor
    }
}

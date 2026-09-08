package com.constitutionatlas.content.client

import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import org.springframework.stereotype.Component

fun Actor.canWriteContent(): Boolean =
    "admin" in roles || "editor" in roles || "content:write" in scopes

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun requireContentWriter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canWriteContent()) {
            throw ForbiddenException("content write requires editor, admin, or content:write")
        }
        return actor
    }
}

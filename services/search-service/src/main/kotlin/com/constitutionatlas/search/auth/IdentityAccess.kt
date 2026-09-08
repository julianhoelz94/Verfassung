package com.constitutionatlas.search.auth

import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import org.springframework.stereotype.Component

fun Actor.canReindex(): Boolean =
    "admin" in roles || "publisher" in roles || "search:reindex" in scopes

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun requireReindex(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canReindex()) {
            throw ForbiddenException("reindex requires publisher, admin, or search:reindex")
        }
        return actor
    }
}

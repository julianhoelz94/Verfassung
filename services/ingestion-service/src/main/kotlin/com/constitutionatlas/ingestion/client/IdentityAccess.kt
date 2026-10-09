package com.constitutionatlas.ingestion.client

import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import org.springframework.stereotype.Component

fun Actor.canImport(): Boolean = "editor" in roles || "admin" in roles || "ingestion:import" in scopes

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun requireImporter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canImport()) {
            throw ForbiddenException("import requires editor, admin, or ingestion:import")
        }
        return actor
    }

    fun requireEditor(authorization: String?): Actor = requireRole(authorization, "editor")

    fun requireReviewer(authorization: String?): Actor = requireRole(authorization, "reviewer")

    fun requirePublisher(authorization: String?): Actor {
        val actor = requireRole(authorization, "publisher")
        if (!actor.stepUpFresh) throw ForbiddenException("Fresh authenticator confirmation required")
        return actor
    }

    fun requireStaff(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") }) {
            throw ForbiddenException("staff role required")
        }
        return actor
    }

    fun authenticate(authorization: String?): Actor = identityClient.authenticate(authorization)

    private fun requireRole(authorization: String?, role: String): Actor {
        val actor = identityClient.authenticate(authorization)
        if (role !in actor.roles && "admin" !in actor.roles) throw ForbiddenException("$role role required")
        return actor
    }
}

object DownstreamAuth {
    private val holder = ThreadLocal<String?>()

    fun <T> withAuthorization(authorization: String?, block: () -> T): T {
        holder.set(authorization)
        return try {
            block()
        } finally {
            holder.remove()
        }
    }

    fun header(): String? = holder.get()
}

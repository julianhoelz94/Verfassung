package com.constitutionatlas.ingestion.client

import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import org.springframework.stereotype.Component

fun Actor.canImport(): Boolean = "admin" in roles || "ingestion:import" in scopes

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun requireImporter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canImport()) {
            throw ForbiddenException("import requires admin or ingestion:import")
        }
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

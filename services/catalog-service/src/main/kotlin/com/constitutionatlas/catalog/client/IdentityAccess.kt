package com.constitutionatlas.catalog.client

import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import org.springframework.stereotype.Component

fun Actor.canWriteCatalog(): Boolean =
    "admin" in roles || "editor" in roles || "catalog:write" in scopes

fun Actor.canPublishCatalog(): Boolean =
    "admin" in roles || "publisher" in roles || "catalog:publish" in scopes

fun Actor.canViewStaffCatalog(): Boolean =
    "admin" in roles || "editor" in roles || "reviewer" in roles || "publisher" in roles || "catalog:write" in scopes

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun mayViewPrivateCatalog(authorization: String?): Boolean {
        if (authorization.isNullOrBlank()) return false
        return try {
            val actor = identityClient.authenticate(authorization)
            actor.canViewStaffCatalog() || actor.scopes.any { it == "ingestion:import" || it == "ingestion:publish" || it == "content:write" }
        } catch (_: RuntimeException) {
            false
        }
    }
    fun requireCatalogWriter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canWriteCatalog()) {
            throw ForbiddenException("catalog write requires editor, admin, or catalog:write")
        }
        return actor
    }

    fun requireCatalogPublisher(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canPublishCatalog()) {
            throw ForbiddenException("catalog publish requires publisher, admin, or catalog:publish")
        }
        return actor
    }

    fun requireVersionPublisher(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canPublishCatalog() && "ingestion:publish" !in actor.scopes) {
            throw ForbiddenException("version publication requires publisher or ingestion:publish")
        }
        return actor
    }

    fun requireStaffCatalog(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canViewStaffCatalog()) {
            throw ForbiddenException("staff catalog listing requires editor, reviewer, publisher, or admin")
        }
        return actor
    }
}

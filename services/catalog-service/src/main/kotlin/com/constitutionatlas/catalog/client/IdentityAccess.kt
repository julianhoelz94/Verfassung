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
    "admin" in roles || "editor" in roles || "reviewer" in roles || "publisher" in roles

@Component
class WriteAccess(private val identityClient: IdentityClient) {
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

    fun requireStaffCatalog(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canViewStaffCatalog()) {
            throw ForbiddenException("staff catalog listing requires editor, reviewer, publisher, or admin")
        }
        return actor
    }
}

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

fun Actor.canWriteAmendmentDrafts(): Boolean = "admin" in roles || "editor" in roles

fun Actor.canPublishAmendments(): Boolean = "admin" in roles || "publisher" in roles

fun Actor.canViewStaffAmendments(): Boolean =
    "admin" in roles || "editor" in roles || "reviewer" in roles || "publisher" in roles

fun Actor.canLinkAmendmentTargets(): Boolean = canWriteAmendmentDrafts() || canPublishAmendments()

@Component
class WriteAccess(private val identityClient: IdentityClient) {
    fun requireAmendmentWriter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canWriteAmendments()) {
            throw ForbiddenException("amendment write requires editor, publisher, admin, or content:write")
        }
        return actor
    }

    fun requireAmendmentDraftWriter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canWriteAmendmentDrafts()) {
            throw ForbiddenException("amendment draft write requires editor or admin")
        }
        return actor
    }

    fun requireAmendmentPublisher(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canPublishAmendments()) {
            throw ForbiddenException("amendment publish requires publisher or admin")
        }
        return actor
    }

    fun requireStaffAmendment(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canViewStaffAmendments()) {
            throw ForbiddenException("staff amendment access requires editor, reviewer, publisher, or admin")
        }
        return actor
    }

    fun staffActorOrNull(authorization: String?): Actor? {
        if (authorization.isNullOrBlank()) {
            return null
        }
        val actor = identityClient.authenticate(authorization)
        return actor.takeIf { it.canViewStaffAmendments() }
    }

    fun requireAmendmentLinker(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (!actor.canLinkAmendmentTargets()) {
            throw ForbiddenException("amendment link-target requires editor, publisher, or admin")
        }
        return actor
    }
}

package com.constitutionatlas.editor.client

import com.constitutionatlas.editor.api.Actor
import java.util.UUID

interface IdentityClient {
    fun authenticate(authorizationHeader: String?): Actor
}

data class IdentityUserWire(
    val id: UUID,
    val email: String,
    val roles: List<String> = emptyList(),
    val stepUpFresh: Boolean = true,
)

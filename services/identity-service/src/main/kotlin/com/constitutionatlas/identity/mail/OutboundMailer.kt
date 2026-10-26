package com.constitutionatlas.identity.mail

interface OutboundMailer {
    val enabled: Boolean

    fun sendPasswordReset(to: String, token: String)

    fun sendInvite(to: String, token: String)

    fun sendRegistration(to: String, token: String)

    fun sendTest(to: String)
}

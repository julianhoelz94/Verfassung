package com.constitutionatlas.identity.mail

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

object MailLinks {
    fun reset(publicBaseUrl: String, token: String): String = page(publicBaseUrl, "reset", token)

    fun invite(publicBaseUrl: String, token: String): String = page(publicBaseUrl, "invite", token)

    private fun page(publicBaseUrl: String, path: String, token: String): String {
        val base = publicBaseUrl.trim().trimEnd('/')
        val encoded = URLEncoder.encode(token, StandardCharsets.UTF_8).replace("+", "%20")
        return "$base/$path?token=$encoded"
    }
}

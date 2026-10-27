package com.constitutionatlas.identity.crypto

import org.springframework.security.crypto.password.PasswordEncoder

/** A missing hash must never become an account credential or a successful password change. */
fun PasswordEncoder.encodeRequired(password: CharSequence): String =
    checkNotNull(encode(password)) { "Password encoder returned no hash" }

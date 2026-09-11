package com.constitutionatlas.catalog

class ConflictException(
    message: String,
    val code: String? = null,
) : RuntimeException(message)

package com.constitutionatlas.amendment

class ConflictException(message: String) : RuntimeException(message)

class ContentUnavailableException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

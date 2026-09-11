package com.constitutionatlas.amendment

class ConflictException(message: String) : RuntimeException(message)

class GoneException(message: String, val code: String = "use_amendment_write_api") : RuntimeException(message)

class ContentUnavailableException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

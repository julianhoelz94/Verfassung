package com.constitutionatlas.content

class VersionPublishedException : RuntimeException("Cannot mutate a published version")

class CatalogUnavailableException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

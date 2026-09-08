package com.constitutionatlas.content

class NotFoundException(message: String) : RuntimeException(message)

class UnauthorizedException(message: String) : RuntimeException(message)

class ForbiddenException(message: String) : RuntimeException(message)

class VersionPublishedException : RuntimeException("Cannot mutate a published version")

class CatalogUnavailableException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

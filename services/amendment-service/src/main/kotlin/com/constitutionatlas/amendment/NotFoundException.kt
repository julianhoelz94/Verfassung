package com.constitutionatlas.amendment

// Callers: AmendmentService, NotFoundAdvice. Unique exception types in this package.
// API: 409 may include pin-conflict code; 503 for catalog. User instruction: "Work on Sprint 36"
class ConflictException(message: String, val code: String? = null) : RuntimeException(message)

class GoneException(message: String, val code: String = "use_amendment_write_api") : RuntimeException(message)

class ContentUnavailableException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

class CatalogUnavailableException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

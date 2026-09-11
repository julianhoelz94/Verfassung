package com.constitutionatlas.editor

import com.constitutionatlas.platform.ForbiddenException

class StepUpRequiredException : ForbiddenException("Recent step-up authentication required")

class ConflictException(
    message: String,
    val code: String? = null,
) : RuntimeException(message)

class DownstreamException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

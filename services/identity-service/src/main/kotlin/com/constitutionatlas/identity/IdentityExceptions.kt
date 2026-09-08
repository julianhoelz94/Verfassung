package com.constitutionatlas.identity

import com.constitutionatlas.platform.ForbiddenException

class StepUpRequiredException : ForbiddenException("Recent step-up authentication required")

class ConflictException(message: String) : RuntimeException(message)

class BadRequestException(message: String) : RuntimeException(message)

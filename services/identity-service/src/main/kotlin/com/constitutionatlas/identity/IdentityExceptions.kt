package com.constitutionatlas.identity

open class ForbiddenException(message: String) : RuntimeException(message)

class StepUpRequiredException : ForbiddenException("Recent step-up authentication required")

class ConflictException(message: String) : RuntimeException(message)

class BadRequestException(message: String) : RuntimeException(message)

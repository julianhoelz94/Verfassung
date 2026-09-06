package com.constitutionatlas.editor

class UnauthorizedException(message: String) : RuntimeException(message)

open class ForbiddenException(message: String) : RuntimeException(message)

class StepUpRequiredException : ForbiddenException("Recent step-up authentication required")

class NotFoundException(message: String) : RuntimeException(message)

class ConflictException(message: String) : RuntimeException(message)

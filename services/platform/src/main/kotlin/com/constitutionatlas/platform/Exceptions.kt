package com.constitutionatlas.platform

class NotFoundException(message: String) : RuntimeException(message)

class UnauthorizedException(message: String) : RuntimeException(message)

open class ForbiddenException(message: String) : RuntimeException(message)

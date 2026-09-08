package com.constitutionatlas.catalog

class NotFoundException(message: String) : RuntimeException(message)

class UnauthorizedException(message: String) : RuntimeException(message)

class ForbiddenException(message: String) : RuntimeException(message)

package com.constitutionatlas.identity

class ForbiddenException(message: String) : RuntimeException(message)

class ConflictException(message: String) : RuntimeException(message)

class BadRequestException(message: String) : RuntimeException(message)

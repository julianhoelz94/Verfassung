package com.constitutionatlas.identity

class TooManyRequestsException(message: String = "Invalid credentials") : RuntimeException(message)

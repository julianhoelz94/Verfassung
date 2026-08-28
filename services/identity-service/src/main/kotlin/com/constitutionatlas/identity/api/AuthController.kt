package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.AuthService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
class AuthController(private val authService: AuthService) {
    @PostMapping("/login")
    fun login(@RequestBody request: LoginRequest): SessionDto =
        authService.login(request.email, request.password)

    @GetMapping("/me")
    fun me(@RequestHeader(value = "Authorization", required = false) authorization: String?): UserDto =
        authService.me(authorization)

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(@RequestHeader(value = "Authorization", required = false) authorization: String?) {
        authService.logout(authorization)
    }
}

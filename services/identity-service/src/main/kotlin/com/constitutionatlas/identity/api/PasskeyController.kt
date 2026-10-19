package com.constitutionatlas.identity.api

import com.constitutionatlas.identity.service.PasskeyInfo
import com.constitutionatlas.identity.service.PasskeyService
import com.constitutionatlas.identity.service.PasskeyStart
import com.fasterxml.jackson.databind.JsonNode
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class StartPasskeyEnrollmentRequest(val password: String)

data class StartLoginPasskeyEnrollmentRequest(val challengeToken: String)

data class FinishPasskeyEnrollmentRequest(val challengeId: UUID, val credential: JsonNode, val label: String = "Passkey")

data class FinishLoginPasskeyEnrollmentRequest(val challengeToken: String, val challengeId: UUID, val credential: JsonNode, val label: String = "Passkey")

data class FinishPasskeyLoginRequest(val challengeId: UUID, val credential: JsonNode)

data class RevokePasskeyRequest(val password: String)

@RestController
class PasskeyController(private val service: PasskeyService) {
    @GetMapping("/passkeys")
    fun list(@RequestHeader(value = "Authorization", required = false) authorization: String?): List<PasskeyInfo> = service.list(authorization)

    @PostMapping("/passkeys/enroll/start")
    fun startEnrollment(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: StartPasskeyEnrollmentRequest,
    ): PasskeyStart = service.startEnrollment(authorization, request.password)

    @PostMapping("/passkeys/enroll/finish")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun finishEnrollment(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: FinishPasskeyEnrollmentRequest,
    ) {
        service.finishEnrollment(authorization, request.challengeId, request.credential, request.label)
    }

    @PostMapping("/passkeys/enroll/login/start")
    fun startLoginEnrollment(@RequestBody request: StartLoginPasskeyEnrollmentRequest): PasskeyStart =
        service.startLoginEnrollment(request.challengeToken)

    @PostMapping("/passkeys/enroll/login/finish")
    fun finishLoginEnrollment(@RequestBody body: FinishLoginPasskeyEnrollmentRequest, request: HttpServletRequest): LoginResponse =
        service.finishLoginEnrollment(body.challengeToken, body.challengeId, body.credential, body.label, clientIp(request), request.getHeader("User-Agent"))

    @PostMapping("/passkeys/login/start")
    fun startLogin(request: HttpServletRequest): PasskeyStart = service.startLogin(clientIp(request))

    @PostMapping("/passkeys/step-up/start")
    fun startStepUp(@RequestHeader(value = "Authorization", required = false) authorization: String?): PasskeyStart = service.startStepUp(authorization)

    @PostMapping("/passkeys/step-up/finish")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun finishStepUp(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody body: FinishPasskeyLoginRequest,
        request: HttpServletRequest,
    ) = service.finishStepUp(authorization, body.challengeId, body.credential, clientIp(request), request.getHeader("User-Agent"))

    @PostMapping("/passkeys/login/finish")
    fun finishLogin(@RequestBody body: FinishPasskeyLoginRequest, request: HttpServletRequest): LoginResponse =
        service.finishLogin(body.challengeId, body.credential, clientIp(request), request.getHeader("User-Agent"))

    @DeleteMapping("/passkeys/{credentialId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revoke(
        @PathVariable credentialId: String,
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: RevokePasskeyRequest,
    ) {
        service.revoke(authorization, credentialId, request.password)
    }

    private fun clientIp(request: HttpServletRequest): String =
        request.getHeader("X-Forwarded-For")?.split(",")?.firstOrNull()?.trim()?.ifBlank { null }
            ?: request.remoteAddr ?: "unknown"
}

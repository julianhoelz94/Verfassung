package com.constitutionatlas.identity.service

import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class SessionPurgeJob(private val authService: AuthService) {
    @Scheduled(fixedDelayString = "PT10M")
    fun purge() {
        authService.purgeExpired()
    }
}

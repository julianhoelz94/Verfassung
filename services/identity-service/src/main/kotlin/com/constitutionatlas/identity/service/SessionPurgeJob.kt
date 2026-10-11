package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.repo.OAuthRepository
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class SessionPurgeJob(private val authService: AuthService, private val oauth: OAuthRepository) {
    @Scheduled(fixedDelayString = "PT10M")
    fun purge() {
        authService.purgeExpired()
        oauth.purgeExpired()
    }
}

package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.repo.AnonymousBrowsingRepository
import com.constitutionatlas.identity.repo.AnonymousBrowsingSettings
import com.constitutionatlas.identity.repo.AnonymousRate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class AnonymousBrowsingService(
    private val repository: AnonymousBrowsingRepository,
    private val authService: AuthService,
) {
    fun publicPolicy(): AnonymousBrowsingSettings {
        val saved = repository.get()
        return if (saved.allowed) {
            saved
        } else {
            saved.copy(
                perIp = saved.perIp.copy(requests = 0),
                total = saved.total.copy(requests = 0),
            )
        }
    }

    fun read(authorization: String?): AnonymousBrowsingSettings {
        requireAdmin(authorization)
        return repository.get()
    }

    @Transactional
    fun update(authorization: String?, request: AnonymousBrowsingSettings): AnonymousBrowsingSettings {
        requireAdmin(authorization)
        authService.requireFreshStepUp(authorization)
        validate(request.perIp)
        validate(request.total)
        repository.update(request)
        return repository.get()
    }

    private fun validate(rate: AnonymousRate) {
        if (rate.requests !in 1..1_000_000 ||
            rate.windowValue !in 1..365 ||
            rate.windowUnit !in setOf("minutes", "hours", "days")
        ) {
            throw BadRequestException("Anonymous browsing rates must be positive and use minutes, hours, or days")
        }
    }

    private fun requireAdmin(authorization: String?) = authService.requireAdminSession(authorization)
}

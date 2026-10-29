package com.constitutionatlas.identity.service

import com.constitutionatlas.identity.BadRequestException
import com.constitutionatlas.identity.api.SwaggerAccessDto
import com.constitutionatlas.identity.api.UpdateSwaggerAccessRequest
import com.constitutionatlas.identity.repo.SwaggerAccessRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class SwaggerAccessService(
    private val repository: SwaggerAccessRepository,
    private val authService: AuthService,
) {
    fun publicPolicy(): SwaggerAccessDto = SwaggerAccessDto(repository.enabled())

    fun read(authorization: String?): SwaggerAccessDto {
        authService.requireAdminSession(authorization)
        return publicPolicy()
    }

    @Transactional
    fun update(authorization: String?, request: UpdateSwaggerAccessRequest): SwaggerAccessDto {
        authService.requireAdminSession(authorization)
        authService.requireFreshStepUp(authorization)
        repository.update(request.enabled ?: throw BadRequestException("enabled is required"))
        return publicPolicy()
    }
}

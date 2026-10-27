package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.OperationsStatus
import com.constitutionatlas.ingestion.client.WriteAccess
import com.constitutionatlas.ingestion.repo.OperationsRepository
import com.constitutionatlas.platform.ForbiddenException
import org.springframework.stereotype.Service

@Service
class OperationsService(private val access: WriteAccess, private val operations: OperationsRepository) {
    fun status(authorization: String?): OperationsStatus {
        val actor = access.authenticate(authorization)
        if ("admin" !in actor.roles && "operations:read" !in actor.scopes) throw ForbiddenException("Operations status requires admin or operations:read")
        return OperationsStatus("ingestion", operations.queues())
    }
}

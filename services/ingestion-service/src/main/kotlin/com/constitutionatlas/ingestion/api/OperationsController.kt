package com.constitutionatlas.ingestion.api

import com.constitutionatlas.ingestion.service.OperationsService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController

data class OperationQueueStatus(val name: String, val pendingCount: Long, val failedCount: Long, val oldestAgeSeconds: Long)
data class OperationsStatus(val service: String, val queues: List<OperationQueueStatus>)

@RestController
class OperationsController(private val operations: OperationsService) {
    @GetMapping("/operations/status")
    fun status(@RequestHeader(value = "Authorization", required = false) authorization: String?): OperationsStatus = operations.status(authorization)
}

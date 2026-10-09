package com.constitutionatlas.content.api

import com.constitutionatlas.content.client.WriteAccess
import com.constitutionatlas.content.client.ContentReadAccess
import com.constitutionatlas.content.service.OrderedContentService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class OrderedContentController(private val content: OrderedContentService, private val access: WriteAccess, private val readAccess: ContentReadAccess) {
    @GetMapping("/versions/{versionId}/content")
    fun get(@PathVariable versionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): OrderedSnapshot {
        readAccess.requireVisible(versionId, authorization)
        return content.get(versionId)
    }

    @PutMapping("/versions/{versionId}/content")
    fun save(@PathVariable versionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: OrderedSnapshotWrite): OrderedSnapshot {
        access.requireContentWriter(authorization)
        return content.save(versionId, request)
    }

    @GetMapping("/versions/{versionId}/export")
    fun export(@PathVariable versionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): OrderedContentExport {
        readAccess.requireVisible(versionId, authorization)
        return content.export(versionId)
    }

    @GetMapping("/versions/{versionId}/publish-receipt")
    fun receipt(@PathVariable versionId: UUID, @RequestParam attemptId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): OrderedSnapshot {
        readAccess.requireVisible(versionId, authorization)
        return content.publishReceipt(versionId, attemptId)
    }

    @GetMapping("/versions/{versionId}/resolve")
    fun resolve(@PathVariable versionId: UUID, @RequestParam logicalId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): ResolvedContent {
        readAccess.requireVisible(versionId, authorization)
        return content.resolve(versionId, logicalId)
    }
}

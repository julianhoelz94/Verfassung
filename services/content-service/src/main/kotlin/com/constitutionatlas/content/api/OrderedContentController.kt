package com.constitutionatlas.content.api

import com.constitutionatlas.content.client.WriteAccess
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
class OrderedContentController(private val content: OrderedContentService, private val access: WriteAccess) {
    @GetMapping("/versions/{versionId}/content")
    fun get(@PathVariable versionId: UUID): OrderedSnapshot = content.get(versionId)

    @PutMapping("/versions/{versionId}/content")
    fun save(@PathVariable versionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: OrderedSnapshotWrite): OrderedSnapshot {
        access.requireContentWriter(authorization)
        return content.save(versionId, request)
    }

    @GetMapping("/versions/{versionId}/resolve")
    fun resolve(@PathVariable versionId: UUID, @RequestParam logicalId: UUID): ResolvedContent = content.resolve(versionId, logicalId)
}

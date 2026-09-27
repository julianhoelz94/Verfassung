package com.constitutionatlas.editor.api

import com.constitutionatlas.editor.service.StructuredDraftService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class StructuredDraftController(private val drafts: StructuredDraftService) {
    @PostMapping("/edit-sessions/{sessionId}/structured-saves")
    fun save(@PathVariable sessionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: StructuredDraftSave): StructuredDraftPreview = drafts.save(authorization, sessionId, request)

    @GetMapping("/edit-sessions/{sessionId}/structured-draft")
    fun preview(@PathVariable sessionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): StructuredDraftPreview = drafts.preview(authorization, sessionId)
}

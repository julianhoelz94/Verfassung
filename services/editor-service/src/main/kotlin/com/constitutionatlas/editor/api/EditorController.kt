package com.constitutionatlas.editor.api

import com.constitutionatlas.editor.service.EditorService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class EditorController(private val editorService: EditorService) {
    @PostMapping("/edit-sessions")
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody request: CreateSessionRequest,
    ): EditSessionDto = editorService.createSession(authorization, request)

    @GetMapping("/edit-sessions/{sessionId}")
    fun preview(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable sessionId: UUID,
    ): DraftPreviewDto = editorService.preview(authorization, sessionId)

    @PostMapping("/edit-sessions/{sessionId}/saves")
    fun save(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable sessionId: UUID,
        @RequestBody request: SaveDraftRequest,
    ): DraftPreviewDto = editorService.save(authorization, sessionId, request)

    @PostMapping("/edit-sessions/{sessionId}/review")
    fun review(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable sessionId: UUID,
    ): DraftPreviewDto = editorService.submitReview(authorization, sessionId)

    @PostMapping("/edit-sessions/{sessionId}/approval")
    fun approve(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable sessionId: UUID,
    ): DraftPreviewDto = editorService.approve(authorization, sessionId)

    @PostMapping("/edit-sessions/{sessionId}/publish")
    fun publish(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable sessionId: UUID,
    ): DraftPreviewDto = editorService.publish(authorization, sessionId)
}

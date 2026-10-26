package com.constitutionatlas.editor.api

import com.constitutionatlas.editor.service.DiffReviewDecisionWrite
import com.constitutionatlas.editor.service.DiffReviewState
import com.constitutionatlas.editor.service.EditorService
import com.constitutionatlas.editor.service.StructuredDiffReviewService
import com.constitutionatlas.editor.service.StructuredDraftService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class StructuredDraftController(private val drafts: StructuredDraftService, private val diffReview: StructuredDiffReviewService, private val editor: EditorService) {
    @PostMapping("/edit-sessions/{sessionId}/structured-saves")
    fun save(@PathVariable sessionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: StructuredDraftSave): StructuredDraftPreview = drafts.save(authorization, sessionId, request)

    @GetMapping("/edit-sessions/{sessionId}/structured-draft")
    fun preview(@PathVariable sessionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): StructuredDraftPreview = drafts.preview(authorization, sessionId)

    @GetMapping("/edit-sessions/{sessionId}/diff-review")
    fun diffReview(@PathVariable sessionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?): DiffReviewState = diffReview.refresh(drafts.preview(authorization, sessionId))

    @PostMapping("/edit-sessions/{sessionId}/diff-review/decisions")
    fun decide(@PathVariable sessionId: UUID, @RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: DiffReviewDecisionWrite): DiffReviewState =
        diffReview.decide(drafts.preview(authorization, sessionId), request, editor.actor(authorization).canReview())
}

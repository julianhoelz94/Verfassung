package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.SaveDocumentRequest
import com.constitutionatlas.document.repo.DocumentFileRepository
import com.constitutionatlas.document.repo.DocumentRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class DocumentAttachmentService(
    private val documents: DocumentService,
    private val files: DocumentFileRepository,
    private val repository: DocumentRepository,
) {
    @Transactional
    fun add(id: UUID, expectedRevision: Int, fileName: String, contentType: String, bytes: ByteArray, actor: Actor): DocumentDto {
        files.validate(fileName, contentType, bytes)
        val current = documents.get(id)
        require(current.revision.attachments.size < 100) { "A document may have at most 100 attachments" }
        val revised = newRevision(current, expectedRevision, actor)
        files.add(revised.revision.id, fileName, contentType, bytes)
        repository.event(id, "attachment_added", actor.id, revised.revision.id)
        return documents.get(id)
    }

    @Transactional
    fun remove(id: UUID, attachmentId: UUID, expectedRevision: Int, actor: Actor): DocumentDto {
        val current = documents.get(id)
        requireAttachment(current, attachmentId)
        val revised = newRevision(current, expectedRevision, actor)
        files.remove(revised.revision.id, attachmentId)
        repository.event(id, "attachment_removed", actor.id, revised.revision.id)
        return documents.get(id)
    }

    @Transactional
    fun primary(id: UUID, attachmentId: UUID, expectedRevision: Int, actor: Actor): DocumentDto {
        val current = documents.get(id)
        requireAttachment(current, attachmentId)
        val revised = newRevision(current, expectedRevision, actor)
        files.setPrimary(revised.revision.id, attachmentId)
        repository.event(id, "primary_attachment_changed", actor.id, revised.revision.id)
        return documents.get(id)
    }

    private fun newRevision(current: DocumentDto, expectedRevision: Int, actor: Actor): DocumentDto {
        if (current.currentRevision != expectedRevision) throw DocumentConflictException("Document revision changed")
        return documents.revise(
            current.id,
            SaveDocumentRequest(
                title = current.revision.title,
                description = current.revision.description,
                sourceUrl = current.revision.sourceUrl,
                expectedRevision = expectedRevision,
            ),
            actor,
        )
    }

    private fun requireAttachment(document: DocumentDto, attachmentId: UUID) {
        if (document.revision.attachments.none { it.id == attachmentId }) throw NotFoundException("Attachment not found")
    }
}

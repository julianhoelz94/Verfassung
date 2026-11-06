package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.DocumentFolderDto
import com.constitutionatlas.document.api.DocumentPageDto
import com.constitutionatlas.document.api.DocumentTagDto
import com.constitutionatlas.document.repo.DocumentRepository
import com.constitutionatlas.document.repo.LibraryRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class LibraryService(private val repository: LibraryRepository, private val documents: DocumentService, private val documentRepository: DocumentRepository) {
    fun search(q: String? = null, folderId: UUID? = null, tagId: UUID? = null, status: String = "active", offset: Int = 0, limit: Int = 30, sort: String = "created"): DocumentPageDto {
        require(status in setOf("active", "archived", "all")) { "Invalid document status" }
        require(offset >= 0 && limit in 1..200 && (q?.length ?: 0) <= 500) { "Invalid search range" }
        require(sort in setOf("title", "key", "year", "created")) { "Invalid sort order" }
        if (folderId != null) folder(folderId)
        if (tagId != null) tag(tagId)
        return repository.search(q, folderId, tagId, status, offset, limit, sort)
    }

    fun all(folderId: UUID? = null): List<DocumentDto> {
        if (folderId != null) folder(folderId)
        return repository.all(folderId)
    }

    fun folders(): List<DocumentFolderDto> = repository.folders()

    fun folder(id: UUID): DocumentFolderDto = repository.folder(id) ?: throw NotFoundException("Folder not found")

    fun tags(): List<DocumentTagDto> = repository.tags()

    fun tag(id: UUID): DocumentTagDto = repository.tag(id) ?: throw NotFoundException("Tag not found")

    @Transactional
    fun createFolder(name: String, actor: Actor): DocumentFolderDto {
        val clean = name(name)
        val tag = repository.createTag(clean, actor.id)
        return repository.createFolder(clean, tag.id, actor.id)
    }

    @Transactional
    fun renameFolder(id: UUID, name: String): DocumentFolderDto {
        if (!repository.renameFolder(id, name(name))) throw NotFoundException("Folder not found")
        return folder(id)
    }

    @Transactional
    fun deleteFolder(id: UUID) {
        if (!repository.deleteFolder(id)) throw NotFoundException("Folder not found")
    }

    @Transactional
    fun createTag(name: String, actor: Actor): DocumentTagDto = repository.createTag(name(name), actor.id)

    @Transactional
    fun renameTag(id: UUID, name: String): DocumentTagDto {
        if (!repository.renameTag(id, name(name))) throw NotFoundException("Tag not found")
        return tag(id)
    }

    @Transactional
    fun addTag(documentId: UUID, tagId: UUID, actor: Actor): DocumentDto {
        documents.get(documentId)
        tag(tagId)
        if (repository.addTag(documentId, tagId, actor.id)) documentRepository.event(documentId, "tag_added:$tagId", actor.id, null)
        return documents.get(documentId)
    }

    @Transactional
    fun removeTag(documentId: UUID, tagId: UUID, actor: Actor): DocumentDto {
        documents.get(documentId)
        tag(tagId)
        if (repository.removeTag(documentId, tagId)) documentRepository.event(documentId, "tag_removed:$tagId", actor.id, null)
        return documents.get(documentId)
    }

    fun keyDocument(key: String): DocumentDto? = documents.keyDocument(key)

    private fun name(value: String): String = value.trim().also { require(it.length in 1..120 && it.none { c -> c.isISOControl() }) { "Name must be 1 to 120 characters" } }
}

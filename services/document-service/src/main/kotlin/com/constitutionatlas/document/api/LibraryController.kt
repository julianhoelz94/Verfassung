package com.constitutionatlas.document.api

import com.constitutionatlas.document.repo.DocumentRepository
import com.constitutionatlas.document.service.DocumentService
import com.constitutionatlas.document.service.LibraryService
import com.constitutionatlas.platform.NotFoundException
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class LibraryNameRequest(val name: String)

data class KeyAvailabilityDto(val valid: Boolean, val available: Boolean)

@RestController
@RequestMapping("/library")
class LibraryController(private val library: LibraryService, private val documents: DocumentService, private val repository: DocumentRepository) {
    @GetMapping("/documents")
    fun search(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) folderId: UUID?,
        @RequestParam(required = false) tagId: UUID?,
        @RequestParam(defaultValue = "active") status: String,
        @RequestParam(defaultValue = "0") offset: Int,
        @RequestParam(defaultValue = "30") limit: Int,
        @RequestParam(defaultValue = "created") sort: String,
    ): DocumentPageDto {
        documents.requireReader(authorization)
        return library.search(q, folderId, tagId, status, offset, limit, sort)
    }

    @GetMapping("/folders")
    fun folders(@RequestHeader(value = "Authorization", required = false) authorization: String?): List<DocumentFolderDto> {
        documents.requireReader(authorization)
        return library.folders()
    }

    @PostMapping("/folders")
    @ResponseStatus(HttpStatus.CREATED)
    fun createFolder(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: LibraryNameRequest): DocumentFolderDto =
        library.createFolder(request.name, documents.requireWriter(authorization))

    @PutMapping("/folders/{id}")
    fun renameFolder(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID, @RequestBody request: LibraryNameRequest): DocumentFolderDto {
        documents.requireWriter(authorization)
        return library.renameFolder(id, request.name)
    }

    @DeleteMapping("/folders/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteFolder(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID) {
        documents.requireWriter(authorization)
        library.deleteFolder(id)
    }

    @GetMapping("/tags")
    fun tags(@RequestHeader(value = "Authorization", required = false) authorization: String?): List<DocumentTagDto> {
        documents.requireReader(authorization)
        return library.tags()
    }

    @PostMapping("/tags")
    @ResponseStatus(HttpStatus.CREATED)
    fun createTag(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestBody request: LibraryNameRequest): DocumentTagDto =
        library.createTag(request.name, documents.requireWriter(authorization))

    @PutMapping("/tags/{id}")
    fun renameTag(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID, @RequestBody request: LibraryNameRequest): DocumentTagDto {
        documents.requireWriter(authorization)
        return library.renameTag(id, request.name)
    }

    @PutMapping("/documents/{documentId}/tags/{tagId}")
    fun addTag(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable documentId: UUID, @PathVariable tagId: UUID): DocumentDto =
        library.addTag(documentId, tagId, documents.requireWriter(authorization))

    @DeleteMapping("/documents/{documentId}/tags/{tagId}")
    fun removeTag(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable documentId: UUID, @PathVariable tagId: UUID): DocumentDto =
        library.removeTag(documentId, tagId, documents.requireWriter(authorization))

    @GetMapping("/key-availability")
    fun keyAvailability(@RequestHeader(value = "Authorization", required = false) authorization: String?, @RequestParam key: String, @RequestParam(required = false) documentId: UUID?): KeyAvailabilityDto {
        documents.requireReader(authorization)
        val valid = documents.validKey(key)
        val owner = if (valid) repository.keyOwner(key) else null
        return KeyAvailabilityDto(valid, valid && (owner == null || owner == documentId))
    }

    @GetMapping("/keys/{key}")
    fun resolve(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable key: String): DocumentDto {
        documents.requireReader(authorization)
        return library.keyDocument(key) ?: throw NotFoundException("Document not found")
    }

    @GetMapping("/documents/{id}/usage")
    fun usage(@RequestHeader(value = "Authorization", required = false) authorization: String?, @PathVariable id: UUID): List<DocumentLinkEventDto> {
        documents.requireReader(authorization)
        documents.get(id)
        return repository.activeLinksForDocument(id)
    }
}

package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.BibliographyDto
import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.DocumentLinkDto
import com.constitutionatlas.document.api.DocumentRevisionDto
import com.constitutionatlas.document.api.LinkRequest
import com.constitutionatlas.document.api.ReviseMaterialRequest
import com.constitutionatlas.document.api.SaveDocumentRequest
import com.constitutionatlas.document.repo.DocumentFileRepository
import com.constitutionatlas.document.repo.DocumentRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URI
import java.util.UUID

@Service
class DocumentService(
    private val repository: DocumentRepository,
    private val identityClient: IdentityClient,
    private val targetClient: LinkTargetClient,
    private val files: DocumentFileRepository,
) {
    fun requireWriter(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (actor.roles.none { it in setOf("editor", "admin") }) {
            throw ForbiddenException("Document writes require editor or admin")
        }
        return actor
    }

    /** Lifecycle publication access permits only the validated event's independent materials. */
    fun requireLinkWriter(targetType: String, authorization: String?): Actor {
        if (targetType != "lifecycle_material") return requireWriter(authorization)
        val actor = identityClient.authenticate(authorization)
        if (actor.roles.none { it == "publisher" || it == "admin" }) throw ForbiddenException("Lifecycle materials require publisher or admin")
        return actor
    }

    fun requireReader(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if (actor.roles.none { it in setOf("editor", "reviewer", "publisher", "admin") }) {
            throw ForbiddenException("Document history requires editorial access")
        }
        return actor
    }

    fun get(id: UUID, revision: Int? = null): DocumentDto =
        repository.get(id, revision) ?: throw NotFoundException("Document not found")

    fun getVisible(id: UUID, revision: Int?, authorization: String?): DocumentDto {
        val document = get(id, revision)
        if (authorization != null) {
            requireReader(authorization)
        } else if (!publiclyLinked(id, document.revision.id)) {
            throw NotFoundException("Document not found")
        }
        return if (authorization == null) publicDocument(document) else document
    }

    private fun publicDocument(document: DocumentDto): DocumentDto {
        val revision = document.revision
        val bibliography = revision.bibliography.copy(
            extra = revision.bibliography.extra.filterKeys {
                !it.equals("file", ignoreCase = true) && !it.startsWith("\$bibtex.")
            },
        )
        return document.copy(citationKey = revision.citationKey, tags = emptyList(), revision = revision.copy(bibliography = bibliography))
    }

    private fun publiclyLinked(documentId: UUID, revisionId: UUID): Boolean =
        repository.activeLinksForDocument(documentId).any { link ->
            if (link.targetType == "amendment") {
                val publishedScope = targetClient.publishedAmendmentRevision(link.targetId)
                publishedScope != null &&
                    currentLinks("amendment", link.targetId, publishedScope).any { current ->
                        current.documentId == documentId && current.document.revision.id == revisionId
                    }
            } else if (link.targetType in wikiLinkTypes) {
                val revision = repository.revisionById(link.revisionId ?: return@any false)?.revision ?: return@any false
                link.revisionId == revisionId &&
                    link.scopeRevisionId != null &&
                    targetClient.isWikiImagePublic(link.targetType, link.targetId, link.scopeRevisionId, documentId, revision)
            } else {
                (link.revisionId == null && get(documentId).revision.id == revisionId || link.revisionId == revisionId) &&
                    targetClient.isPublic(link.targetType, link.targetId, link.scopeRevisionId)
            }
        }

    fun targetIsPublic(targetType: String, targetId: UUID, scopeRevisionId: UUID?): Boolean {
        validateTarget(targetType)
        return targetClient.isPublic(targetType, targetId, scopeRevisionId)
    }

    fun publicLinks(targetType: String, targetId: UUID, scopeRevisionId: UUID?): List<DocumentLinkDto> =
        currentLinks(targetType, targetId, scopeRevisionId).filter { link ->
            if (targetType in wikiLinkTypes) {
                scopeRevisionId != null &&
                    targetClient.isWikiImagePublic(targetType, targetId, scopeRevisionId, link.documentId, link.document.revision.revision)
            } else {
                true
            }
        }.map { it.copy(document = publicDocument(it.document)) }

    @Transactional
    fun create(request: SaveDocumentRequest, actor: Actor): DocumentDto {
        validate(request)
        val id = UUID.randomUUID()
        val revisionId = UUID.randomUUID()
        val key = request.citationKey?.trim() ?: "doc-$id"
        repository.insertDocument(id, actor.id, key)
        if (!repository.claimKey(id, key)) throw DocumentConflictException("Citation key is already in use", "citation_key_conflict")
        repository.insertRevision(revisionId, id, 1, request.title.trim(), request.description?.trim(), request.sourceUrl?.trim(), null, null, null, actor.id)
        repository.updateMetadata(id, revisionId, key, request.bibliography ?: BibliographyDto())
        repository.event(id, "created", actor.id, revisionId)
        return get(id)
    }

    @Transactional
    fun revise(id: UUID, request: SaveDocumentRequest, actor: Actor): DocumentDto {
        validate(request)
        val expected = request.expectedRevision ?: throw IllegalArgumentException("expectedRevision is required")
        val current = get(id)
        if (current.status != "active" || !repository.advance(id, expected)) {
            throw DocumentConflictException("Document revision changed or document is archived")
        }
        appendMetadataRevision(id, expected + 1, request, current.revision, actor)
        return get(id)
    }

    private fun appendMetadataRevision(id: UUID, number: Int, request: SaveDocumentRequest, source: DocumentRevisionDto, actor: Actor): UUID {
        val key = request.citationKey?.trim() ?: source.citationKey
        if (!repository.claimKey(id, key)) throw DocumentConflictException("Citation key is already in use", "citation_key_conflict")
        val revisionId = UUID.randomUUID()
        repository.insertRevision(revisionId, id, number, request.title.trim(), request.description?.trim(), request.sourceUrl?.trim(), null, null, null, actor.id)
        files.copy(source.id, revisionId)
        repository.updateMetadata(id, revisionId, key, request.bibliography ?: source.bibliography)
        repository.event(id, "revised", actor.id, revisionId)
        return revisionId
    }

    @Transactional
    fun upload(id: UUID, expectedRevision: Int, fileName: String, contentType: String, bytes: ByteArray, actor: Actor): DocumentDto {
        files.validate(fileName, contentType, bytes)
        val current = get(id)
        if (current.status != "active" || !repository.advance(id, expectedRevision)) {
            throw DocumentConflictException("Document revision changed or document is archived")
        }
        val revisionId = UUID.randomUUID()
        repository.insertRevision(
            revisionId, id, expectedRevision + 1, current.revision.title, current.revision.description,
            current.revision.sourceUrl, null, null, null, actor.id,
        )
        files.copy(current.revision.id, revisionId)
        files.storePrimary(revisionId, fileName.trim(), contentType, bytes)
        repository.updateMetadata(id, revisionId, current.citationKey, current.revision.bibliography)
        repository.event(id, "file_uploaded", actor.id, revisionId)
        return get(id)
    }

    @Transactional
    fun archive(id: UUID, actor: Actor): DocumentDto {
        get(id)
        if (!repository.archive(id)) throw DocumentConflictException("Document already archived")
        repository.event(id, "archived", actor.id, null)
        return get(id)
    }

    @Transactional
    fun attach(targetType: String, targetId: UUID, request: LinkRequest, actor: Actor, authorization: String?): List<DocumentLinkDto> {
        requireEditableTarget(targetType, targetId, request.scopeRevisionId, authorization)
        val document = get(request.documentId)
        require(document.status == "active") { "Cannot attach an archived document" }
        require(request.revisionId != null) { "A pinned document revision is required" }
        require(repository.revisionById(request.revisionId)?.documentId == request.documentId) { "Revision does not belong to document" }
        if (currentLinks(targetType, targetId, request.scopeRevisionId, authorization).any { it.documentId == request.documentId }) {
            throw DocumentConflictException("Document is already linked")
        }
        repository.linkEvent(targetType, targetId, request.scopeRevisionId, request.documentId, request.revisionId, "attach", actor.id)
        return currentLinks(targetType, targetId, request.scopeRevisionId, authorization)
    }

    @Transactional
    fun detach(targetType: String, targetId: UUID, scopeRevisionId: UUID?, documentId: UUID, actor: Actor, authorization: String?): List<DocumentLinkDto> {
        requireEditableTarget(targetType, targetId, scopeRevisionId, authorization)
        if (currentLinks(targetType, targetId, scopeRevisionId, authorization).none { it.documentId == documentId }) {
            throw NotFoundException("Document link not found")
        }
        repository.linkEvent(targetType, targetId, scopeRevisionId, documentId, null, "detach", actor.id)
        return currentLinks(targetType, targetId, scopeRevisionId, authorization)
    }

    /** Independent commentary revisions never change the published legal record or its evidence pins. */
    @Transactional
    fun reviseMaterial(targetType: String, targetId: UUID, documentId: UUID, request: ReviseMaterialRequest, actor: Actor, authorization: String?): List<DocumentLinkDto> {
        require(targetType in materialLinkTypes) { "Unsupported material target" }
        requireEditableTarget(targetType, targetId, request.scopeRevisionId, authorization)
        repository.lockDocument(documentId)
        val link = currentLinks(targetType, targetId, request.scopeRevisionId, authorization).find { it.documentId == documentId }
            ?: throw NotFoundException("Material not found")
        if (link.revisionId != request.expectedLinkedRevisionId) throw DocumentConflictException("Material changed; reload before saving")
        require((request.description?.length ?: 0) <= 10000) { "Commentary is too long" }
        if (link.document.revision.revision != request.expectedRevision) throw DocumentConflictException("Material revision changed; reload before saving")
        val current = get(documentId)
        val edit = SaveDocumentRequest(request.title, request.description, request.sourceUrl, citationKey = current.citationKey)
        validate(edit)
        if (!repository.advance(documentId, current.currentRevision)) throw DocumentConflictException("Document is archived")
        val revision = appendMetadataRevision(documentId, current.currentRevision + 1, edit, link.document.revision, actor)
        repository.linkEvent(targetType, targetId, request.scopeRevisionId, documentId, revision, "attach", actor.id)
        return currentLinks(targetType, targetId, request.scopeRevisionId, authorization)
    }

    /** Replay ancestor scopes first; the selected revision overrides inherited attachment events. */
    fun currentLinks(targetType: String, targetId: UUID, scopeRevisionId: UUID?, authorization: String? = null): List<DocumentLinkDto> {
        validateTarget(targetType)
        val scopes = if (targetType == "amendment" && scopeRevisionId != null) {
            listOf<UUID?>(null) + targetClient.amendmentAncestry(targetId, scopeRevisionId, authorization)
        } else {
            listOf(scopeRevisionId)
        }
        val state = linkedMapOf<UUID, com.constitutionatlas.document.api.DocumentLinkEventDto>()
        scopes.forEach { scope ->
            repository.linkEvents(targetType, targetId, scope).asReversed().forEach { event ->
                state[event.documentId] = event
            }
        }
        return state.values
            .filter { it.action == "attach" }
            .map { event ->
                val revision = event.revisionId?.let { repository.revisionById(it)?.revision }
                DocumentLinkDto(event.documentId, event.revisionId, get(event.documentId, revision))
            }
    }

    private fun validate(request: SaveDocumentRequest) {
        require(request.title.isNotBlank() && request.title.length <= 500) { "Title must be 1 to 500 characters" }
        require((request.description?.length ?: 0) <= 10000 && (request.sourceUrl?.length ?: 0) <= 2048) { "Document metadata is too long" }
        request.citationKey?.let { require(validKey(it.trim())) { "Citation key must start with a letter and contain at most 128 letters, digits, underscores, colons or hyphens" } }
        request.bibliography?.let { bibliography ->
            require(bibliography.type.matches(Regex("[A-Za-z][A-Za-z0-9_-]{0,63}"))) { "Invalid bibliography type" }
            require(bibliography.authors.size <= 200 && bibliography.editors.size <= 200 && bibliography.extra.size <= 1000) { "Too many bibliography fields or creators" }
            BibtexCodec.validateExtra(bibliography.extra)
            val strings = bibliography.authors.flatMap { listOfNotNull(it.family, it.given, it.literal) } + bibliography.editors.flatMap { listOfNotNull(it.family, it.given, it.literal) } + listOfNotNull(bibliography.issued, bibliography.containerTitle, bibliography.publisher, bibliography.volume, bibliography.issue, bibliography.pages, bibliography.doi, bibliography.isbn, bibliography.language, bibliography.abstract) + bibliography.extra.keys + bibliography.extra.values
            require(strings.all { it.length <= 20000 } && strings.sumOf { it.length } <= 1000000) { "Bibliography is too long" }
        }
        request.sourceUrl?.takeIf { it.isNotBlank() }?.let {
            val uri = runCatching { URI(it) }.getOrNull()
            require(uri?.scheme in setOf("http", "https") && !uri?.host.isNullOrBlank()) { "sourceUrl must be an HTTP URL" }
        }
    }

    fun validKey(key: String): Boolean = key.matches(Regex("[A-Za-z][A-Za-z0-9_:-]{0,127}"))

    fun keyDocument(key: String): DocumentDto? = repository.keyOwner(key)?.let { get(it) }

    fun requireEditableTarget(targetType: String, targetId: UUID, scopeRevisionId: UUID?, authorization: String?) {
        validateTarget(targetType)
        if (targetType in materialLinkTypes) {
            val actor = identityClient.authenticate(authorization)
            val role = if (targetType == "lifecycle_material") "publisher" else "editor"
            if (actor.roles.none { it == role || it == "admin" }) throw ForbiddenException("Record materials require $role or admin")
        }
        validateScope(targetType, targetId, scopeRevisionId, authorization)
        targetClient.requireTarget(targetType, targetId, authorization)
    }

    private fun validateTarget(targetType: String) {
        require(targetType in setOf("constitution", "version", "amendment") || targetType in wikiLinkTypes || targetType in materialLinkTypes) { "Unsupported link target" }
    }

    private fun validateScope(targetType: String, targetId: UUID, scopeRevisionId: UUID?, authorization: String?) {
        if (targetType in materialLinkTypes) {
            require(targetClient.isPublic(targetType, targetId, scopeRevisionId)) { "Published record material target not found" }
        } else if (targetType == "amendment") {
            require(scopeRevisionId != null) { "Amendment revision is required" }
            targetClient.requireAmendmentRevision(targetId, scopeRevisionId, authorization, false)
        } else if (targetType in wikiLinkTypes) {
            require(scopeRevisionId != null) { "Wiki revision is required" }
            targetClient.requireWikiRevision(targetType, targetId, scopeRevisionId, authorization)
        } else {
            require(scopeRevisionId == null) { "This link does not have a revision scope" }
        }
    }
}

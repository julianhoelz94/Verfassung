package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.ConflictException
import com.constitutionatlas.catalog.api.SaveWikiPage
import com.constitutionatlas.catalog.api.WikiPageRevision
import com.constitutionatlas.catalog.client.WikiMedia
import com.constitutionatlas.catalog.repo.WikiRepository
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class WikiService(private val repo: WikiRepository, private val media: WikiMedia) {
    fun published(targetType: String, targetId: UUID): WikiPageRevision? {
        requireTarget(targetType, targetId)
        return repo.published(targetType, targetId)
    }

    fun draft(targetType: String, targetId: UUID): WikiPageRevision? {
        requireTarget(targetType, targetId)
        return repo.latest(targetType, targetId)
    }

    @Transactional
    fun save(targetType: String, targetId: UUID, request: SaveWikiPage, actorId: UUID): WikiPageRevision {
        requireTarget(targetType, targetId)
        require(request.summary.isNotBlank() && request.summary.length <= 500) { "Summary must be 1–500 characters" }
        require(request.body.length <= 20000) { "Body must be at most 20,000 characters" }
        require(request.images.size <= 30) { "Page may contain at most 30 images" }
        require(request.sourceUrls.size <= 20) { "Page may contain at most 20 sources" }
        request.sourceUrls.forEach { source ->
            require(source.length <= 2048 && (source.startsWith("https://") || source.startsWith("http://"))) { "Source URLs must be HTTP(S) and at most 2,048 characters" }
        }
        request.images.forEach { image ->
            require(image.revision > 0) { "Image revision must be positive" }
            require(image.alt.isNotBlank() && image.alt.length <= 500) { "Image alt text is required and must be at most 500 characters" }
            require(image.caption == null || image.caption.length <= 1000) { "Image caption is too long" }
            require(image.credit == null || image.credit.length <= 500) { "Image credit is too long" }
            require(image.rights == null || image.rights.length <= 500) { "Image rights text is too long" }
            require(image.sourceUrl == null || image.sourceUrl.startsWith("https://") || image.sourceUrl.startsWith("http://")) { "Image source URL must be HTTP(S)" }
        }
        val pageId = repo.ensurePage(targetType, targetId)
        repo.lockPage(pageId)
        val current = repo.latest(targetType, targetId)
        if (current?.id != request.expectedRevisionId) {
            throw ConflictException("Wiki page changed; reload before saving", "wiki_revision_conflict")
        }
        val id = repo.append(pageId, current?.id, request.summary.trim(), request.body.trim(), request.images, request.sourceUrls.distinct(), actorId)
        return repo.revision(targetType, targetId, id)!!
    }

    @Transactional
    fun publish(targetType: String, targetId: UUID, revisionId: UUID, authorization: String? = null): WikiPageRevision {
        requireTarget(targetType, targetId)
        val pageId = repo.pageId(targetType, targetId) ?: throw NotFoundException("Wiki page not found")
        repo.lockPage(pageId)
        val latest = repo.latest(targetType, targetId) ?: throw NotFoundException("Wiki draft not found")
        if (latest.id != revisionId) throw ConflictException("Only the latest wiki revision can be published", "wiki_revision_conflict")
        media.requirePinnedImages(targetType, targetId, revisionId, latest.images, authorization)
        repo.publish(pageId, revisionId)
        return latest
    }

    private fun requireTarget(targetType: String, targetId: UUID) {
        require(targetType in setOf("country", "constitution")) { "Invalid wiki target type" }
        if (!repo.targetExists(targetType, targetId)) throw NotFoundException("Wiki target not found")
    }
}

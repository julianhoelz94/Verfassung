package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.api.ImprintDetailsDto
import com.constitutionatlas.document.api.ImprintDetailsStateDto
import com.constitutionatlas.document.api.LegalPageRevisionDto
import com.constitutionatlas.document.api.LegalPageStateDto
import com.constitutionatlas.document.api.PublishLegalPageRequest
import com.constitutionatlas.document.api.SaveImprintDetailsRequest
import com.constitutionatlas.document.api.SaveLegalPageDraftRequest
import com.constitutionatlas.document.repo.ImprintDetailsRepository
import com.constitutionatlas.document.repo.LegalPageRepository
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.NotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LegalPageService(
    private val repository: LegalPageRepository,
    private val imprintDetailsRepository: ImprintDetailsRepository,
    private val identityClient: IdentityClient,
) {
    fun validateKey(key: String) {
        if (key !in setOf("impressum", "datenschutz", "impressum_en", "datenschutz_en")) throw NotFoundException("Legal page not found")
    }

    fun admin(authorization: String?): Actor {
        val actor = identityClient.authenticate(authorization)
        if ("admin" !in actor.roles) throw ForbiddenException("Legal page administration requires admin")
        return actor
    }

    fun state(key: String): LegalPageStateDto {
        validateKey(key)
        return repository.state(key)
    }

    fun history(key: String): List<LegalPageRevisionDto> {
        validateKey(key)
        return repository.history(key)
    }

    fun published(key: String): LegalPageRevisionDto =
        state(key).published ?: throw NotFoundException("Legal page not published")

    fun imprintDetails(): ImprintDetailsDto =
        imprintDetailsRepository.state().published ?: throw NotFoundException("Imprint details not published")

    fun imprintDetailsState(): ImprintDetailsStateDto = imprintDetailsRepository.state()

    @Transactional
    fun saveImprintDetails(request: SaveImprintDetailsRequest, actor: Actor): ImprintDetailsStateDto {
        require(request.expectedRevision >= 0) { "Invalid expected revision" }
        val fields = listOf(request.name, request.streetAddress, request.postalCode, request.city, request.country, request.email)
        require(fields.all { it.isNotBlank() && it.length <= 255 }) { "Imprint details must be complete" }
        require(request.email.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) { "Invalid contact email" }
        if (!imprintDetailsRepository.save(request, actor.id)) throw DocumentConflictException("Imprint details changed")
        return imprintDetailsState()
    }

    @Transactional
    fun publishImprintDetails(request: PublishLegalPageRequest, actor: Actor): ImprintDetailsStateDto {
        val draft = imprintDetailsState().draft ?: throw DocumentConflictException("Imprint details draft missing")
        require(draft.name != "Verfassung Atlas Musterbetrieb" && draft.email != "kontakt@example.org") {
            "Replace example contact details before publication"
        }
        if (!imprintDetailsRepository.publish(request.expectedRevision)) throw DocumentConflictException("Imprint details changed")
        return imprintDetailsState()
    }

    @Transactional
    fun saveDraft(key: String, request: SaveLegalPageDraftRequest, actor: Actor): LegalPageStateDto {
        validateKey(key)
        val content = request.content.trim()
        require(content.isNotEmpty() && content.length <= 30_000) { "Legal page must contain 1 to 30000 characters" }
        require(request.expectedRevision >= 0) { "Invalid expected revision" }
        request.contact?.let { contact ->
            require(key.startsWith("impressum")) { "Shared contact details belong to the imprint" }
            saveImprintDetails(contact, actor)
        }
        repository.ensure(key)
        if (!repository.advanceDraft(key, request.expectedRevision)) throw DocumentConflictException("Legal page draft changed")
        val revision = request.expectedRevision + 1
        repository.insertRevision(key, revision, content, actor.id)
        repository.event(key, revision, "draft_saved", actor.id)
        return state(key)
    }

    @Transactional
    fun publish(key: String, request: PublishLegalPageRequest, actor: Actor): LegalPageStateDto {
        validateKey(key)
        request.expectedContactRevision?.let { revision ->
            require(key.startsWith("impressum")) { "Shared contact details belong to the imprint" }
            publishImprintDetails(PublishLegalPageRequest(revision), actor)
        }
        if (key.startsWith("impressum")) {
            require(imprintDetailsRepository.state().published != null) { "Publish the shared imprint details first" }
        }
        require(request.expectedRevision > 0) { "A saved draft is required" }
        val draft = state(key).draft ?: throw DocumentConflictException("Legal page draft missing")
        if (key.startsWith("impressum") && draft.separateContact) {
            val details = imprintDetailsRepository.state().published!!
            require(listOf(details.streetAddress, details.postalCode, details.email).none { draft.content.contains(it, ignoreCase = true) }) {
                "Remove contact and address details from the legal prose before publication"
            }
        }
        require(
            !draft.content.contains("BEISPIEL — VOR VERÖFFENTLICHUNG ERSETZEN") &&
                !draft.content.contains("EXAMPLE — REPLACE BEFORE PUBLICATION"),
        ) {
            "Replace example legal details before publication"
        }
        if (!repository.publish(key, request.expectedRevision)) throw DocumentConflictException("Legal page draft changed")
        repository.event(key, request.expectedRevision, "published", actor.id)
        return state(key)
    }
}

package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentConflictException
import com.constitutionatlas.document.repo.DocumentRepository
import com.constitutionatlas.platform.ForbiddenException
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.OrderedSnapshot
import com.constitutionatlas.platform.documentCitations
import com.constitutionatlas.platform.timedRestClient
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class PassageCitationService(
    private val identity: IdentityClient,
    private val documents: DocumentService,
    private val repository: DocumentRepository,
    @Value("\${content.api.url:http://localhost/api/content}") contentUrl: String,
) {
    private val content = timedRestClient(contentUrl)

    /** Caller supplies only a version and generation. References come exclusively from Content. */
    @Transactional
    fun synchronize(version: UUID, generation: Long, authorization: String?) {
        val actor = identity.authenticate(authorization)
        if (actor.roles.none { it in setOf("editor", "publisher", "admin") } && "ingestion:publish" !in actor.scopes) throw ForbiddenException("Citation publication requires editorial or import publication access")
        repository.lockCitationVersion(version)
        val snapshot = content.get().uri("/versions/$version/content").header("Authorization", authorization.orEmpty()).retrieve().body(OrderedSnapshot::class.java)
        if (snapshot == null || snapshot.versionId != version || snapshot.generation != generation) throw DocumentConflictException("Citation source generation changed")
        OrderedContentRules.requireValid(OrderedContentRules.contentErrors(snapshot.roots))
        val citations = snapshot.documentCitations()
        require(citations.size <= 1000) { "Too many document citations" }
        val pins = citations.map { citation -> documents.get(requireNotNull(citation.documentId), requireNotNull(citation.documentRevision)) }
        pins.forEach { document ->
            val revision = document.revision.id
            if (documents.currentLinks("passage_citation", version, revision, authorization).isEmpty()) {
                repository.linkEvent("passage_citation", version, revision, document.id, revision, "attach", actor.id)
            }
        }
    }
}

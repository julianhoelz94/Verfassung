package com.constitutionatlas.document.service

import com.constitutionatlas.platform.NotFoundException
import com.constitutionatlas.platform.documentCitations
import com.constitutionatlas.platform.scalarText
import com.constitutionatlas.platform.timedRestClient
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClientResponseException
import tools.jackson.databind.JsonNode
import java.util.UUID

internal val ingestionLinkTypes = setOf("import_job", "setup_proposal", "migration_run")
internal val wikiLinkTypes = setOf("country_wiki", "constitution_wiki", "jurisdiction_wiki")
internal val materialLinkTypes = setOf("amendment_material", "change_material", "lifecycle_material")

interface LinkTargetClient {
    fun isPassageCitationPublic(versionId: UUID, documentId: UUID, revision: Int): Boolean = false
    fun requireTarget(targetType: String, targetId: UUID, authorization: String?)
    fun isPublic(targetType: String, targetId: UUID, scopeRevisionId: UUID?): Boolean
    fun requireAmendmentRevision(targetId: UUID, scopeRevisionId: UUID, authorization: String?, allowPublished: Boolean)
    fun amendmentAncestry(targetId: UUID, scopeRevisionId: UUID, authorization: String?): List<UUID>
    fun publishedAmendmentRevision(targetId: UUID): UUID?
    fun requireWikiRevision(targetType: String, targetId: UUID, scopeRevisionId: UUID, authorization: String?)
    fun isWikiImagePublic(targetType: String, targetId: UUID, scopeRevisionId: UUID, documentId: UUID, revision: Int): Boolean
}

@Component
class RestLinkTargetClient(
    @Value("\${catalog.api.url:http://localhost/api/catalog}") catalogUrl: String,
    @Value("\${amendment.api.url:http://localhost/api/amendment}") amendmentUrl: String,
    @Value("\${ingestion.api.url:http://localhost/api/ingestion}") ingestionUrl: String = "http://localhost/api/ingestion",
    @Value("\${content.api.url:http://localhost/api/content}") contentUrl: String = "http://localhost/api/content",
) : LinkTargetClient {
    private val content = timedRestClient(contentUrl)
    private val ingestion = timedRestClient(ingestionUrl)
    private val catalog = timedRestClient(catalogUrl)
    private val amendment = timedRestClient(amendmentUrl)

    override fun isPassageCitationPublic(versionId: UUID, documentId: UUID, revision: Int): Boolean = runCatching {
        if (!isPublic("version", versionId, null)) return@runCatching false
        val snapshot = content.get().uri("/versions/$versionId/content").retrieve().body(com.constitutionatlas.platform.OrderedSnapshot::class.java)
        snapshot?.versionId == versionId && snapshot.documentCitations().any { it.documentId == documentId && it.documentRevision == revision }
    }.getOrDefault(false)

    override fun requireTarget(targetType: String, targetId: UUID, authorization: String?) {
        val (client, path) = when (targetType) {
            "import_job" -> ingestion to "/import-jobs/$targetId"
            "setup_proposal" -> ingestion to "/import-setup-proposals/$targetId"
            "migration_run" -> ingestion to "/migration-runs/$targetId"
            "constitution" -> catalog to "/constitutions/$targetId/metadata"
            "version" -> catalog to "/versions/$targetId"
            "amendment" -> amendment to "/amendments/$targetId"
            "amendment_material", "change_material" -> amendment to "/amendments/$targetId"
            "lifecycle_material" -> catalog to "/constitutions/$targetId/lifecycle-events"
            "country_wiki" -> catalog to "/wiki/country/$targetId/draft"
            "constitution_wiki" -> catalog to "/wiki/constitution/$targetId/draft"
            "jurisdiction_wiki" -> catalog to "/wiki/jurisdiction/$targetId/draft"
            else -> throw IllegalArgumentException("Unsupported link target")
        }
        try {
            val call = client.get().uri(path)
            val response = if (authorization != null) call.header("Authorization", authorization) else call
            response.retrieve().toBodilessEntity()
        } catch (ex: RestClientResponseException) {
            if (ex.statusCode == HttpStatus.NOT_FOUND) throw NotFoundException("Link target not found")
            throw ex
        }
    }

    override fun isPublic(targetType: String, targetId: UUID, scopeRevisionId: UUID?): Boolean =
        runCatching {
            when (targetType) {
                "amendment_material", "change_material" -> {
                    val owner = amendment.get().uri("/amendments/$targetId").retrieve().body(JsonNode::class.java)
                    val published = !owner?.path("publishedRevisionId")?.scalarText().isNullOrBlank()
                    published &&
                        if (targetType == "amendment_material") {
                            scopeRevisionId == null
                        } else {
                            scopeRevisionId != null && owner?.path("changes")?.any { it.path("id").scalarText() == scopeRevisionId.toString() } == true
                        }
                }
                "lifecycle_material" -> {
                    scopeRevisionId != null &&
                        listOf("lifecycle-events", "provision-events").any { kind ->
                            val events = catalog.get().uri("/constitutions/$targetId/$kind").retrieve().body(JsonNode::class.java)
                            events?.any { it.path("id").scalarText() == scopeRevisionId.toString() } == true
                        }
                }
                "constitution" -> {
                    val versions = catalog.get().uri("/constitutions/$targetId/versions").retrieve().body(JsonNode::class.java)
                    versions?.isArray == true && versions.size() > 0
                }
                "version", "passage_citation" -> {
                    val version = catalog.get().uri("/versions/$targetId").retrieve().body(JsonNode::class.java)
                    // Published editorial corrections remain public by their immutable ID.
                    version?.path("publicationStatus")?.scalarText() == "published"
                }
                "amendment" -> {
                    if (scopeRevisionId == null) {
                        false
                    } else {
                        val owner = amendment.get().uri("/amendments/$targetId").retrieve().body(JsonNode::class.java)
                        owner?.path("publishedRevisionId")?.scalarText() == scopeRevisionId.toString()
                    }
                }
                "country_wiki", "constitution_wiki", "jurisdiction_wiki" -> {
                    val kind = targetType.removeSuffix("_wiki")
                    val page = catalog.get().uri("/wiki/$kind/$targetId").retrieve().body(JsonNode::class.java)
                    scopeRevisionId != null && page?.path("id")?.scalarText() == scopeRevisionId.toString()
                }
                else -> false
            }
        }.getOrDefault(false)

    override fun requireAmendmentRevision(targetId: UUID, scopeRevisionId: UUID, authorization: String?, allowPublished: Boolean) {
        require(authorization != null) { "Authorization is required" }
        val owner = amendment.get().uri("/amendments/$targetId")
            .header("Authorization", authorization).retrieve().body(JsonNode::class.java)
            ?: throw NotFoundException("Amendment not found")
        val revisions = amendment.get().uri("/amendments/$targetId/revisions")
            .header("Authorization", authorization).retrieve().body(JsonNode::class.java)
            ?: throw NotFoundException("Amendment revisions not found")
        require(revisions.isArray && revisions.size() > 0 && revisions.last().path("id").scalarText() == scopeRevisionId.toString()) {
            "Only the current amendment draft can change links"
        }
        require(allowPublished || owner.path("publishedRevisionId").scalarText() != scopeRevisionId.toString()) {
            "Published amendment links are immutable"
        }
    }

    override fun amendmentAncestry(targetId: UUID, scopeRevisionId: UUID, authorization: String?): List<UUID> {
        val call = amendment.get().uri("/amendments/$targetId/revisions/$scopeRevisionId/ancestry")
        val response = if (authorization != null) call.header("Authorization", authorization) else call
        val ids = response.retrieve().body(Array<UUID>::class.java)
            ?: throw NotFoundException("Amendment revision not found")
        return ids.toList()
    }

    override fun publishedAmendmentRevision(targetId: UUID): UUID? = runCatching {
        val owner = amendment.get().uri("/amendments/$targetId").retrieve().body(JsonNode::class.java)
        owner?.path("publishedRevisionId")?.scalarText()?.takeIf { it.isNotBlank() }?.let(UUID::fromString)
    }.getOrNull()

    override fun requireWikiRevision(targetType: String, targetId: UUID, scopeRevisionId: UUID, authorization: String?) {
        require(authorization != null) { "Authorization is required" }
        require(targetType in wikiLinkTypes) { "Unsupported wiki link target" }
        val kind = targetType.removeSuffix("_wiki")
        val draft = catalog.get().uri("/wiki/$kind/$targetId/draft")
            .header("Authorization", authorization).retrieve().body(JsonNode::class.java)
            ?: throw NotFoundException("Wiki draft not found")
        require(draft.path("id").scalarText() == scopeRevisionId.toString()) { "Only the current wiki draft can change image links" }
        val published = catalog.get().uri("/wiki/$kind/$targetId").retrieve().body(JsonNode::class.java)
        require(published?.path("id")?.scalarText() != scopeRevisionId.toString()) { "Published wiki image links are immutable" }
    }

    override fun isWikiImagePublic(targetType: String, targetId: UUID, scopeRevisionId: UUID, documentId: UUID, revision: Int): Boolean =
        runCatching {
            require(targetType in wikiLinkTypes) { "Unsupported wiki link target" }
            val kind = targetType.removeSuffix("_wiki")
            val page = catalog.get().uri("/wiki/$kind/$targetId/revisions/$scopeRevisionId").retrieve().body(JsonNode::class.java)
            page?.path("id")?.scalarText() == scopeRevisionId.toString() &&
                (page.path("images").toList() + page.path("citations").toList()).any { image ->
                    image.path("documentId").scalarText() == documentId.toString() &&
                        image.path("revision").asInt(0) == revision
                }
        }.getOrDefault(false)
}

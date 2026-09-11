import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.EditorServiceApplication
import com.constitutionatlas.editor.client.AmendmentClient
import com.constitutionatlas.editor.client.LinkedAmendment
import com.constitutionatlas.editor.client.ArticleWritePayload
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.CatalogClient
import com.constitutionatlas.editor.client.CatalogVersion
import com.constitutionatlas.editor.client.ContentClient
import com.constitutionatlas.editor.client.ContentTreeArticle
import com.constitutionatlas.editor.client.SearchIndexClient
import com.constitutionatlas.editor.service.OutboxPublisher
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.LocalDate
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [EditorServiceApplication::class])
class EditorApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var outboxPublisher: OutboxPublisher

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @MockBean
    lateinit var identityClient: IdentityClient

    @MockBean
    lateinit var auditClient: AuditClient

    @MockBean
    lateinit var contentClient: ContentClient

    @MockBean
    lateinit var catalogClient: CatalogClient

    @MockBean
    lateinit var amendmentClient: AmendmentClient

    @MockBean
    lateinit var searchIndexClient: SearchIndexClient

    private val editor = actor("01900000-0000-4000-8000-000000000410", "editor")
    private val reviewer = actor("01900000-0000-4000-8000-000000000411", "reviewer")
    private val publisher = actor("01900000-0000-4000-8000-000000000412", "publisher")
    private val admin = actor("01900000-0000-4000-8000-000000000413", "admin")
    private val viewer = actor("01900000-0000-4000-8000-000000000414", "viewer")

    @BeforeEach
    fun resetStubs() {
        Mockito.reset(identityClient, auditClient, contentClient, catalogClient, amendmentClient, searchIndexClient)
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(
            UnauthorizedException("Missing session"),
        )
        stub(editor)
    }

    @Test
    fun editorReviewerPublisherHappyPathCopiesSuccessor() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        val copyId = stubSuccessorPublish(versionId, articleId)
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        mockMvc.get("/edit-sessions/$sessionId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.revisionCount") { value(1) }
            jsonPath("$.drafts.length()") { value(1) }
            jsonPath("$.drafts[0].body") { value("Draft body.") }
        }
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
            jsonPath("$.publicContentUpdated") { value(true) }
            jsonPath("$.sourceVersionId") { value(versionId.toString()) }
            jsonPath("$.newVersionId") { value(NEW_VERSION_ID.toString()) }
            jsonPath("$.newVersionLabel") { value("2022-1") }
            jsonPath("$.searchIndexStatus") { value("pending") }
        }
        @Suppress("UNCHECKED_CAST")
        val copied = ArgumentCaptor.forClass(List::class.java) as ArgumentCaptor<List<ArticleWritePayload>>
        Mockito.verify(contentClient).replaceArticles(eqNonNull(NEW_VERSION_ID), captureList(copied))
        assertEquals(1, copied.value.size)
        assertEquals(articleId, copied.value[0].predecessorId)
        assertNotNull(copied.value[0].id)
        assertNotEquals(articleId, copied.value[0].id)
        Mockito.verify(contentClient).updateArticle(copyId, "Human dignity", "Draft body.")
        Mockito.verify(contentClient, Mockito.never()).updateArticle(
            eqNonNull(articleId),
            Mockito.anyString() ?: "",
            Mockito.anyString() ?: "",
        )
        Mockito.verify(catalogClient).publishVersion(NEW_VERSION_ID)
        Mockito.verify(searchIndexClient, Mockito.never()).reindex()
        Mockito.verify(amendmentClient, Mockito.never()).linkTarget(
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyString(),
        )
        Mockito.verify(amendmentClient, Mockito.never()).publishAmendment(
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyString(),
        )
        Mockito.verify(catalogClient).createDraftVersion(
            eqNonNull(UUID.fromString("01900000-0000-4000-8000-000000000002")),
            Mockito.anyString() ?: "2022-1",
            Mockito.nullable(LocalDate::class.java),
            Mockito.anyString() ?: "en",
            eqNonNull(versionId),
            eqNonNull("editorial_correction"),
        )
        val eventNames = jdbcTemplate.queryForList(
            "SELECT event_name FROM outbox_events WHERE session_id = ?::uuid ORDER BY event_name",
            String::class.java,
            sessionId,
        )
        assertEquals(
            listOf("search.reindex-requested", "version.published"),
            eventNames,
        )
        outboxPublisher.processDue()
        mockMvc.get("/edit-sessions/$sessionId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.searchIndexStatus") { value("ready") }
            jsonPath("$.newVersionId") { value(NEW_VERSION_ID.toString()) }
        }
        Mockito.verify(searchIndexClient).reindex()
    }

    @Test
    fun roleMatrixRejectsCommandsTheActorCannotPerform() {
        val versionId = UUID.randomUUID()
        stub(reviewer)
        mockMvc.post("/edit-sessions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionId":"$versionId"}"""
        }.andExpect { status { isForbidden() } }
        stub(publisher)
        mockMvc.post("/edit-sessions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionId":"$versionId"}"""
        }.andExpect { status { isForbidden() } }
        stub(viewer)
        mockMvc.post("/edit-sessions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionId":"$versionId"}"""
        }.andExpect { status { isForbidden() } }

        stub(editor)
        val sessionId = openSession(versionId)
        mockMvc.post("/edit-sessions/$sessionId/approval") {
            header("Authorization", TOKEN)
        }.andExpect { status { isForbidden() } }
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect { status { isForbidden() } }

        stub(reviewer)
        mockMvc.post("/edit-sessions/$sessionId/saves") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"articleId":"${UUID.randomUUID()}","title":"X","body":"Y"}"""
        }.andExpect { status { isForbidden() } }
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun adminCanRunTheFullEditorialFlow() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.randomUUID()
        val copyId = stubSuccessorPublish(versionId, articleId, "Title", "old")
        stub(admin)
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId, "Title", "New body.")
        postCommand(sessionId, "review", "reviewing")
        postCommand(sessionId, "approval", "approved")
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
        }
        Mockito.verify(contentClient).updateArticle(copyId, "Title", "New body.")
        Mockito.verify(contentClient, Mockito.never()).updateArticle(
            eqNonNull(articleId),
            Mockito.anyString() ?: "",
            Mockito.anyString() ?: "",
        )
    }

    @Test
    fun publishKeepsSessionPublishedWhenReindexFails() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        stubSuccessorPublish(versionId, articleId)
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
            jsonPath("$.newVersionId") { value(NEW_VERSION_ID.toString()) }
            jsonPath("$.searchIndexStatus") { value("pending") }
        }
        Mockito.doThrow(DownstreamException("reindex denied")).`when`(searchIndexClient).reindex()
        outboxPublisher.processDue()
        mockMvc.get("/edit-sessions/$sessionId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
            jsonPath("$.searchIndexStatus") { value("failed") }
        }
        Mockito.doNothing().`when`(searchIndexClient).reindex()
        outboxPublisher.processDue()
        mockMvc.get("/edit-sessions/$sessionId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.searchIndexStatus") { value("ready") }
        }
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun editorialPublishSkipsAmendmentLinkAndPublish() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        stubSuccessorPublish(versionId, articleId)
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
        }
        Mockito.verify(amendmentClient, Mockito.never()).linkTarget(
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyString(),
        )
        Mockito.verify(amendmentClient, Mockito.never()).publishAmendment(
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyString(),
        )
    }

    @Test
    fun publishKeepsSessionPublishedWhenAuditAppendFails() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        stubSuccessorPublish(versionId, articleId)
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        Mockito.doThrow(DownstreamException("audit denied")).`when`(auditClient).record(
            Mockito.any(Actor::class.java) ?: publisher,
            Mockito.anyString(),
            Mockito.anyString(),
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyMap(),
        )
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
        }
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun publisherCannotPublishUntilApproved() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.randomUUID()
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect { status { isConflict() } }
        stub(editor)
        postCommand(sessionId, "review", "reviewing")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect { status { isConflict() } }
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        stubSuccessorPublish(versionId, articleId)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect { status { isOk() } }
    }

    @Test
    fun publishWithoutFreshStepUpIsForbidden() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.randomUUID()
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(Actor(publisher.id, publisher.email, publisher.roles, stepUpFresh = false))
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.code") { value("step_up_required") }
        }
    }

    @Test
    fun missingTokenIsUnauthorized() {
        mockMvc.post("/edit-sessions") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionId":"${UUID.randomUUID()}"}"""
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun listSessionsFiltersAndRejectsViewer() {
        val versionA = UUID.randomUUID()
        val versionB = UUID.randomUUID()
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        stub(editor)
        val sessionA = openSession(versionA)
        saveDraft(sessionA, articleId)
        openSession(versionB)

        mockMvc.get("/edit-sessions") {
            header("Authorization", TOKEN)
            param("openedBy", "me")
            param("versionId", versionA.toString())
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].openedBy") { value(editor.id.toString()) }
            jsonPath("$[0].versionId") { value(versionA.toString()) }
            jsonPath("$[0].changedArticleCount") { value(1) }
        }

        mockMvc.get("/edit-sessions") {
            header("Authorization", TOKEN)
            param("versionId", versionA.toString())
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].changedArticleCount") { value(1) }
        }

        mockMvc.get("/edit-sessions") {
            header("Authorization", TOKEN)
            param("openedBy", "me")
            param("status", "open")
            param("versionId", versionB.toString())
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].changedArticleCount") { value(0) }
        }

        stub(reviewer)
        mockMvc.get("/edit-sessions") {
            header("Authorization", TOKEN)
            param("status", "open")
        }.andExpect { status { isOk() } }

        stub(viewer)
        mockMvc.get("/edit-sessions") {
            header("Authorization", TOKEN)
        }.andExpect { status { isForbidden() } }
    }


    @Test
    fun legalPublishLinksAndPublishesAmendment() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        val amendmentId = UUID.fromString("01900000-0000-4000-8000-000000000801")
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000002")
        stubSuccessorPublish(versionId, articleId)
        Mockito.`when`(amendmentClient.getAmendment(eqNonNull(amendmentId), Mockito.anyString())).thenReturn(
            LinkedAmendment(
                id = amendmentId,
                constitutionId = constitutionId,
                kind = "legal_amendment",
                status = "draft",
                title = "Test amendment",
            ),
        )
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"hopKind":"legal_amendment","amendmentId":"$amendmentId"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
        }
        Mockito.verify(amendmentClient).linkTarget(
            eqNonNull(amendmentId),
            eqNonNull(versionId),
            eqNonNull(NEW_VERSION_ID),
            eqNonNull(TOKEN),
        )
        Mockito.verify(amendmentClient).publishAmendment(eqNonNull(amendmentId), eqNonNull(TOKEN))
        val eventNames = jdbcTemplate.queryForList(
            "SELECT event_name FROM outbox_events WHERE session_id = ?::uuid ORDER BY event_name",
            String::class.java,
            sessionId,
        )
        assertEquals(
            listOf("amendment.recorded", "search.reindex-requested", "version.published"),
            eventNames,
        )
    }

    @Test
    fun publishRejectsMissingHopKind() {
        val versionId = UUID.randomUUID()
        val sessionId = openSession(versionId)
        saveDraft(sessionId, UUID.randomUUID())
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun editorialPublishRejectsAmendmentId() {
        val versionId = UUID.randomUUID()
        val sessionId = openSession(versionId)
        saveDraft(sessionId, UUID.randomUUID())
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"hopKind":"editorial_correction","amendmentId":"${UUID.randomUUID()}"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun legalPublishRequiresAmendmentId() {
        val versionId = UUID.randomUUID()
        val sessionId = openSession(versionId)
        saveDraft(sessionId, UUID.randomUUID())
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"hopKind":"legal_amendment"}"""
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun publishRejectsNonTipSessionVersion() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.randomUUID()
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000002")
        val source = CatalogVersion(versionId, constitutionId, "2022", "published", LocalDate.parse("2022-12-19"), "en")
        val successor = CatalogVersion(NEW_VERSION_ID, constitutionId, "2022-1", "published", null, "en", versionId, "editorial_correction", "public")
        Mockito.`when`(catalogClient.getVersion(versionId)).thenReturn(source)
        Mockito.`when`(catalogClient.listVersions(eqNonNull(constitutionId), Mockito.anyString() ?: "all"))
            .thenReturn(listOf(source, successor))
        Mockito.`when`(contentClient.listArticles(versionId)).thenReturn(
            listOf(ContentTreeArticle(articleId, versionId, "1", "Title", 1, "body")),
        )
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = EDITORIAL_PUBLISH_BODY
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("not_tip") }
        }
        Mockito.verify(catalogClient, Mockito.never()).createDraftVersion(
            eqNonNull(constitutionId),
            Mockito.anyString() ?: "",
            Mockito.nullable(LocalDate::class.java),
            Mockito.anyString() ?: "",
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyString() ?: "",
        )
    }

    @Test
    fun legalPublishRejectsWrongConstitutionAmendment() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.randomUUID()
        val amendmentId = UUID.randomUUID()
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000002")
        stubSuccessorPublish(versionId, articleId)
        Mockito.`when`(amendmentClient.getAmendment(eqNonNull(amendmentId), Mockito.anyString())).thenReturn(
            LinkedAmendment(
                id = amendmentId,
                constitutionId = UUID.randomUUID(),
                kind = "legal_amendment",
                status = "draft",
                title = "Wrong constitution",
            ),
        )
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"hopKind":"legal_amendment","amendmentId":"$amendmentId"}"""
        }.andExpect { status { isBadRequest() } }
        Mockito.verify(catalogClient, Mockito.never()).createDraftVersion(
            eqNonNull(constitutionId),
            Mockito.anyString() ?: "",
            Mockito.nullable(LocalDate::class.java),
            Mockito.anyString() ?: "",
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyString() ?: "",
        )
    }

    private fun stubSuccessorPublish(
        sourceVersionId: UUID,
        sourceArticleId: UUID,
        title: String = "Human dignity",
        sourceBody: String = "old body",
    ): UUID {
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000002")
        val copyId = UUID.fromString("01900000-0000-4000-8000-000000000601")
        val source =
            CatalogVersion(sourceVersionId, constitutionId, "2022", "published", LocalDate.parse("2022-12-19"), "en")
        val draft =
            CatalogVersion(NEW_VERSION_ID, constitutionId, "2022-1", "draft", LocalDate.parse("2022-12-19"), "en")
        val published =
            CatalogVersion(NEW_VERSION_ID, constitutionId, "2022-1", "published", LocalDate.parse("2022-12-19"), "en")
        Mockito.`when`(catalogClient.getVersion(sourceVersionId)).thenReturn(source)
        Mockito.`when`(
            catalogClient.createDraftVersion(
                eqNonNull(constitutionId),
                Mockito.anyString() ?: "2022-1",
                Mockito.nullable(LocalDate::class.java),
                Mockito.anyString() ?: "en",
                eqNonNull(sourceVersionId),
                Mockito.anyString() ?: "editorial_correction",
            ),
        ).thenReturn(draft)
        Mockito.`when`(catalogClient.listVersions(eqNonNull(constitutionId), Mockito.anyString() ?: "all"))
            .thenReturn(listOf(source))
        Mockito.`when`(catalogClient.publishVersion(NEW_VERSION_ID)).thenReturn(published)
        Mockito.`when`(amendmentClient.getAmendment(Mockito.any(UUID::class.java) ?: UUID(0, 0), Mockito.anyString()))
            .thenReturn(null)
        Mockito.doNothing().`when`(amendmentClient).linkTarget(
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyString(),
        )
        Mockito.doNothing().`when`(amendmentClient).publishAmendment(
            Mockito.any(UUID::class.java) ?: UUID(0, 0),
            Mockito.anyString(),
        )
        val sourceTree =
            listOf(
                ContentTreeArticle(sourceArticleId, sourceVersionId, "1", title, 1, sourceBody),
            )
        val copyTree =
            listOf(
                ContentTreeArticle(copyId, NEW_VERSION_ID, "1", title, 1, sourceBody),
            )
        Mockito.`when`(contentClient.listArticles(sourceVersionId)).thenReturn(sourceTree)
        Mockito.`when`(contentClient.listArticles(NEW_VERSION_ID)).thenReturn(copyTree)
        return copyId
    }

    private fun stub(actor: Actor) {
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(actor)
    }

    private fun openSession(versionId: UUID): String {
        val sessionJson = mockMvc.post("/edit-sessions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"versionId":"$versionId"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("open") }
        }.andReturn().response.contentAsString
        return Regex("\"id\":\"([^\"]+)\"").find(sessionJson)!!.groupValues[1]
    }

    private fun saveDraft(
        sessionId: String,
        articleId: UUID,
        title: String = "Human dignity",
        body: String = "Draft body.",
    ) {
        mockMvc.post("/edit-sessions/$sessionId/saves") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"articleId":"$articleId","title":"$title","body":"$body"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.revisionCount") { value(1) }
        }
    }

    @Test
    fun saveRejectsDeeplyNestedJson() {
        mockMvc.post("/edit-sessions/${UUID.randomUUID()}/saves") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = nestedJson(40)
        }.andExpect { status { isBadRequest() } }
    }

    private fun postCommand(sessionId: String, command: String, expectedStatus: String) {
        mockMvc.post("/edit-sessions/$sessionId/$command") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value(expectedStatus) }
        }
    }

    companion object {
        private const val EDITORIAL_PUBLISH_BODY = """{"hopKind":"editorial_correction"}"""
        private const val TOKEN = "Bearer test-token"
        private val NEW_VERSION_ID = UUID.fromString("01900000-0000-4000-8000-000000000501")
        private fun nestedJson(depth: Int): String = (1..depth).fold("1") { acc, _ -> """{"x":$acc}""" }

        private fun actor(id: String, role: String) =
            Actor(UUID.fromString(id), "local-$role@example.local", listOf(role), stepUpFresh = true)

        private fun <T : Any> eqNonNull(value: T): T = Mockito.eq(value) ?: value

        private fun captureList(
            captor: ArgumentCaptor<List<ArticleWritePayload>>,
        ): List<ArticleWritePayload> {
            captor.capture()
            return emptyList()
        }

        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("spring.task.scheduling.enabled") { "false" }
        }
    }
}

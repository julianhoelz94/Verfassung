import com.constitutionatlas.editor.EditorServiceApplication
import com.constitutionatlas.editor.DownstreamException
import com.constitutionatlas.editor.UnauthorizedException
import com.constitutionatlas.editor.api.Actor
import com.constitutionatlas.editor.client.AmendmentClient
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.CatalogClient
import com.constitutionatlas.editor.client.CatalogVersion
import com.constitutionatlas.editor.client.ContentClient
import com.constitutionatlas.editor.client.ContentTreeArticle
import com.constitutionatlas.editor.client.IdentityClient
import com.constitutionatlas.editor.client.SearchIndexClient
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
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
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
            jsonPath("$.publicContentUpdated") { value(true) }
            jsonPath("$.sourceVersionId") { value(versionId.toString()) }
            jsonPath("$.newVersionId") { value(NEW_VERSION_ID.toString()) }
            jsonPath("$.newVersionLabel") { value("2022-1") }
        }
        Mockito.verify(contentClient).updateArticle(copyId, "Human dignity", "Draft body.")
        Mockito.verify(contentClient, Mockito.never()).updateArticle(
            eqNonNull(articleId),
            Mockito.anyString() ?: "",
            Mockito.anyString() ?: "",
        )
        Mockito.verify(catalogClient).publishVersion(NEW_VERSION_ID)
        Mockito.verify(searchIndexClient).reindex()
        Mockito.verify(amendmentClient).recordTransition(versionId, NEW_VERSION_ID)
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
        }.andExpect { status { isForbidden() } }

        stub(reviewer)
        mockMvc.post("/edit-sessions/$sessionId/saves") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"articleId":"${UUID.randomUUID()}","title":"X","body":"Y"}"""
        }.andExpect { status { isForbidden() } }
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
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
        Mockito.doThrow(DownstreamException("reindex denied")).`when`(searchIndexClient).reindex()
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
            jsonPath("$.newVersionId") { value(NEW_VERSION_ID.toString()) }
        }
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
        }.andExpect { status { isConflict() } }
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
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
        }
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
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
        }.andExpect { status { isConflict() } }
        stub(editor)
        postCommand(sessionId, "review", "reviewing")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
        }.andExpect { status { isConflict() } }
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        stubSuccessorPublish(versionId, articleId)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
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
            ),
        ).thenReturn(draft)
        Mockito.`when`(catalogClient.publishVersion(NEW_VERSION_ID)).thenReturn(published)
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

    private fun postCommand(sessionId: String, command: String, expectedStatus: String) {
        mockMvc.post("/edit-sessions/$sessionId/$command") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value(expectedStatus) }
        }
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private val NEW_VERSION_ID = UUID.fromString("01900000-0000-4000-8000-000000000501")

        private fun actor(id: String, role: String) =
            Actor(UUID.fromString(id), "local-$role@example.local", listOf(role))

        private fun <T : Any> eqNonNull(value: T): T = Mockito.eq(value) ?: value

        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}

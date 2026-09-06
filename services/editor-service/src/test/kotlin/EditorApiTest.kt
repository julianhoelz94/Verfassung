import com.constitutionatlas.editor.EditorServiceApplication
import com.constitutionatlas.editor.UnauthorizedException
import com.constitutionatlas.editor.api.Actor
import com.constitutionatlas.editor.client.AuditClient
import com.constitutionatlas.editor.client.ContentArticle
import com.constitutionatlas.editor.client.ContentClient
import com.constitutionatlas.editor.client.IdentityClient
import com.constitutionatlas.editor.client.SearchIndexClient
import com.constitutionatlas.editor.config.EditorPublishProperties
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
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [EditorServiceApplication::class])
class EditorApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var publishProperties: EditorPublishProperties

    @MockBean
    lateinit var identityClient: IdentityClient

    @MockBean
    lateinit var auditClient: AuditClient

    @MockBean
    lateinit var contentClient: ContentClient

    @MockBean
    lateinit var searchIndexClient: SearchIndexClient

    private val editor = actor("01900000-0000-4000-8000-000000000410", "editor")
    private val reviewer = actor("01900000-0000-4000-8000-000000000411", "reviewer")
    private val publisher = actor("01900000-0000-4000-8000-000000000412", "publisher")
    private val admin = actor("01900000-0000-4000-8000-000000000413", "admin")
    private val viewer = actor("01900000-0000-4000-8000-000000000414", "viewer")

    @BeforeEach
    fun resetStubs() {
        Mockito.reset(identityClient, auditClient, contentClient, searchIndexClient)
        publishProperties.rewritePublicContent = true
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(
            UnauthorizedException("Missing session"),
        )
        stub(editor)
    }

    @Test
    fun editorReviewerPublisherHappyPathRewritesPublicContent() {
        val versionId = UUID.randomUUID()
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        Mockito.`when`(contentClient.getArticle(articleId)).thenReturn(
            ContentArticle(articleId, versionId, "Human dignity", "old body"),
        )
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
        }
        Mockito.verify(contentClient).updateArticle(articleId, "Human dignity", "Draft body.")
        Mockito.verify(searchIndexClient).reindex()
    }

    @Test
    fun publishWithFlagOffSkipsContentRewrite() {
        publishProperties.rewritePublicContent = false
        val versionId = UUID.randomUUID()
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        val sessionId = openSession(versionId)
        saveDraft(sessionId, articleId)
        postCommand(sessionId, "review", "reviewing")
        stub(reviewer)
        postCommand(sessionId, "approval", "approved")
        stub(publisher)
        mockMvc.post("/edit-sessions/$sessionId/publish") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.session.status") { value("published") }
            jsonPath("$.publicContentUpdated") { value(false) }
        }
        Mockito.verifyNoInteractions(contentClient)
        Mockito.verifyNoInteractions(searchIndexClient)
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
        Mockito.`when`(contentClient.getArticle(articleId)).thenReturn(
            ContentArticle(articleId, versionId, "Title", "old"),
        )
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
        Mockito.verify(contentClient).updateArticle(articleId, "Title", "New body.")
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
        Mockito.`when`(contentClient.getArticle(articleId)).thenReturn(
            ContentArticle(articleId, versionId, "Human dignity", "old"),
        )
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

        private fun actor(id: String, role: String) =
            Actor(UUID.fromString(id), "local-$role@example.local", listOf(role))

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

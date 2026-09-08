import com.constitutionatlas.amendment.AmendmentServiceApplication
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.CatalogVersion
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.client.ContentTreeArticle
import com.constitutionatlas.amendment.client.ContentTreeNode
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
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
@SpringBootTest(classes = [AmendmentServiceApplication::class])
class AmendmentApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockBean
    lateinit var identityClient: IdentityClient

    @MockBean
    lateinit var contentClient: ContentClient

    @MockBean
    lateinit var catalogClient: CatalogClient

    private val editor =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000410"), "local-editor@example.local", listOf("editor"))
    private val viewer =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000411"), "local-viewer@example.local", listOf("viewer"))

    @BeforeEach
    fun stubIdentity() {
        Mockito.reset(identityClient, contentClient, catalogClient)
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(editor)
        Mockito.`when`(identityClient.authenticate(VIEWER_TOKEN)).thenReturn(viewer)
    }

    @Test
    fun listAmendmentsFor2022Version() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/amendments")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(1) }
                jsonPath("$[0].targetVersionId") { value("01900000-0000-4000-8000-000000000004") }
                jsonPath("$[0].changes.length()") { value(5) }
                jsonPath("$[0].changes[0].changeType") { value("added") }
                jsonPath("$[0].changes[0].nodeId") { value("01900000-0000-4000-8000-000000000225") }
                jsonPath("$[0].changes[0].changedOn") { value("2022-12-19") }
                jsonPath("$[0].changes[1].changeType") { value("changed") }
                jsonPath("$[0].changes[0].amendingLawCitationId") { value("01900000-0000-4000-8000-000000000380") }
                jsonPath("$[0].changes[0].amendingLawTitle") {
                    value("Gesetz zur Änderung des Grundgesetzes (seed)")
                }
                jsonPath("$[0].changes[0].amendingLawCitation") { value("BGBl. I 2022") }
            }
    }

    @Test
    fun listAmendmentsCanFilterBySourceVersion() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/amendments") {
            param("sourceVersionId", "01900000-0000-4000-8000-000000000003")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].sourceVersionId") { value("01900000-0000-4000-8000-000000000003") }
        }

        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/amendments") {
            param("sourceVersionId", "00000000-0000-4000-8000-000000000099")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun listAmendmentsByArticleAcrossTwoVersions() {
        mockMvc.get("/amendments") {
            param("constitutionId", "01900000-0000-4000-8000-000000000002")
            param("articleNumber", "1")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].targetVersionId") { value("01900000-0000-4000-8000-000000000004") }
            jsonPath("$[0].changes[0].changedOn") { value("2022-12-19") }
            jsonPath("$[0].changes[0].articleNumber") { value("1") }
            jsonPath("$[1].targetVersionId") { value("01900000-0000-4000-8000-000000000005") }
            jsonPath("$[1].changes.length()") { value(1) }
            jsonPath("$[1].changes[0].changedOn") { value("2023-06-01") }
            jsonPath("$[1].changes[0].articleNumber") { value("1") }
        }
    }

    @Test
    fun listAmendmentsByArticleRequiresQuery() {
        mockMvc.get("/amendments").andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun unknownVersionReturnsEmptyList() {
        mockMvc.get("/versions/00000000-0000-4000-8000-000000000099/amendments")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(0) }
            }
    }

    @Test
    fun recordTransitionRequiresBearer() {
        mockMvc.post("/transitions") {
            contentType = MediaType.APPLICATION_JSON
            content = transitionJson(SOURCE_ID, TARGET_ID)
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun recordTransitionRejectsViewer() {
        mockMvc.post("/transitions") {
            header("Authorization", VIEWER_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = transitionJson(SOURCE_ID, TARGET_ID)
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun recordTransitionComputesAddedChangedRemoved() {
        stubTrees()
        Mockito.`when`(catalogClient.getVersion(TARGET_ID)).thenReturn(CatalogVersion(TARGET_ID, CONSTITUTION_ID))

        mockMvc.post("/transitions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = transitionJson(SOURCE_ID, TARGET_ID)
        }.andExpect {
            status { isOk() }
            jsonPath("$.sourceVersionId") { value(SOURCE_ID.toString()) }
            jsonPath("$.targetVersionId") { value(TARGET_ID.toString()) }
            jsonPath("$.title") { value("Gesetz zur Änderung des Grundgesetzes") }
            jsonPath("$.sourceReference") { value("BGBl. I 2024, 1") }
            jsonPath("$.summary") { value("2 added, 1 changed, 1 removed") }
            jsonPath("$.changes.length()") { value(4) }
            jsonPath("$.changes[0].changeType") { value("added") }
            jsonPath("$.changes[0].nodeId") { value(PARAGRAPH_2_TARGET.toString()) }
            jsonPath("$.changes[1].changeType") { value("changed") }
            jsonPath("$.changes[1].nodeId") { value(ARTICLE_1_TARGET.toString()) }
            jsonPath("$.changes[2].changeType") { value("added") }
            jsonPath("$.changes[2].nodeId") { value(ARTICLE_16A_TARGET.toString()) }
            jsonPath("$.changes[3].changeType") { value("removed") }
            jsonPath("$.changes[3].nodeId") { value(ARTICLE_2_SOURCE.toString()) }
            jsonPath("$.changes[0].amendingLawTitle") { value("Gesetz zur Änderung des Grundgesetzes") }
            jsonPath("$.changes[0].amendingLawCitation") { value("BGBl. I 2024, 1") }
        }

        mockMvc.get("/versions/$TARGET_ID/amendments") {
            param("sourceVersionId", SOURCE_ID.toString())
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].changes.length()") { value(4) }
        }

        mockMvc.get("/amendments") {
            param("constitutionId", CONSTITUTION_ID.toString())
            param("articleNumber", "16a")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[1].targetVersionId") { value(TARGET_ID.toString()) }
        }

        mockMvc.post("/transitions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = transitionJson(SOURCE_ID, TARGET_ID)
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun recordTransitionMatchesByKindAndNumberWithoutPredecessor() {
        val sourceVersion = UUID.fromString("01900000-0000-4000-8000-000000000903")
        val targetVersion = UUID.fromString("01900000-0000-4000-8000-000000000904")
        val sourceArticle = UUID.fromString("01900000-0000-4000-8000-000000000913")
        val targetArticle = UUID.fromString("01900000-0000-4000-8000-000000000933")
        Mockito.`when`(contentClient.listArticles(sourceVersion)).thenReturn(
            listOf(
                ContentTreeArticle(sourceArticle, sourceVersion, "79", "Eternity", 1, "old clause"),
            ),
        )
        Mockito.`when`(contentClient.listArticles(targetVersion)).thenReturn(
            listOf(
                ContentTreeArticle(targetArticle, targetVersion, "79", "Eternity", 1, "new clause"),
            ),
        )

        mockMvc.post("/transitions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = transitionJson(sourceVersion, targetVersion)
        }.andExpect {
            status { isOk() }
            jsonPath("$.summary") { value("0 added, 1 changed, 0 removed") }
            jsonPath("$.changes.length()") { value(1) }
            jsonPath("$.changes[0].changeType") { value("changed") }
            jsonPath("$.changes[0].nodeId") { value(targetArticle.toString()) }
            jsonPath("$.changes[0].articleNumber") { value("79") }
        }
    }

    private fun stubTrees() {
        Mockito.`when`(contentClient.listArticles(SOURCE_ID)).thenReturn(
            listOf(
                ContentTreeArticle(
                    ARTICLE_1_SOURCE,
                    SOURCE_ID,
                    "1",
                    "Dignity",
                    1,
                    "old",
                    listOf(
                        ContentTreeNode(PARAGRAPH_1_SOURCE, "paragraph", number = "1", body = "old para"),
                    ),
                ),
                ContentTreeArticle(ARTICLE_2_SOURCE, SOURCE_ID, "2", "Gone", 2, "bye"),
            ),
        )
        Mockito.`when`(contentClient.listArticles(TARGET_ID)).thenReturn(
            listOf(
                ContentTreeArticle(
                    ARTICLE_1_TARGET,
                    TARGET_ID,
                    "1",
                    "Dignity",
                    1,
                    "new",
                    listOf(
                        ContentTreeNode(
                            PARAGRAPH_1_TARGET,
                            "paragraph",
                            number = "1",
                            body = "old para",
                            predecessorId = PARAGRAPH_1_SOURCE,
                        ),
                        ContentTreeNode(PARAGRAPH_2_TARGET, "paragraph", number = "2", body = "extra"),
                    ),
                    predecessorId = ARTICLE_1_SOURCE,
                ),
                ContentTreeArticle(ARTICLE_16A_TARGET, TARGET_ID, "16a", "Asylum", 2, "new right"),
            ),
        )
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private const val VIEWER_TOKEN = "Bearer viewer-token"
        private val CONSTITUTION_ID = UUID.fromString("01900000-0000-4000-8000-000000000002")
        private val SOURCE_ID = UUID.fromString("01900000-0000-4000-8000-000000000901")
        private val TARGET_ID = UUID.fromString("01900000-0000-4000-8000-000000000902")
        private val ARTICLE_1_SOURCE = UUID.fromString("01900000-0000-4000-8000-000000000911")
        private val ARTICLE_2_SOURCE = UUID.fromString("01900000-0000-4000-8000-000000000912")
        private val ARTICLE_1_TARGET = UUID.fromString("01900000-0000-4000-8000-000000000931")
        private val ARTICLE_16A_TARGET = UUID.fromString("01900000-0000-4000-8000-000000000932")
        private val PARAGRAPH_1_SOURCE = UUID.fromString("01900000-0000-4000-8000-000000000921")
        private val PARAGRAPH_1_TARGET = UUID.fromString("01900000-0000-4000-8000-000000000941")
        private val PARAGRAPH_2_TARGET = UUID.fromString("01900000-0000-4000-8000-000000000942")

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

        private fun transitionJson(source: UUID, target: UUID): String =
            """
            {
              "sourceVersionId": "$source",
              "targetVersionId": "$target",
              "changedOn": "2024-01-15",
              "effectiveOn": "2024-01-16",
              "amendingLawTitle": "Gesetz zur Änderung des Grundgesetzes",
              "amendingLawCitation": "BGBl. I 2024, 1"
            }
            """.trimIndent()
    }
}

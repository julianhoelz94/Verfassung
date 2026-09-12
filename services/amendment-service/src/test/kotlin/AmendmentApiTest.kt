import com.constitutionatlas.amendment.AmendmentServiceApplication
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.CatalogVersionRef
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.client.ContentTreeArticle
import com.constitutionatlas.amendment.client.ContentTreeNode
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import com.fasterxml.jackson.databind.ObjectMapper
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

    private val objectMapper = ObjectMapper()

    @MockBean
    lateinit var identityClient: IdentityClient

    @MockBean
    lateinit var contentClient: ContentClient

    @MockBean
    lateinit var catalogClient: CatalogClient

    private val editor =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000410"), "local-editor@example.local", listOf("editor"))
    private val publisher =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000412"), "local-publisher@example.local", listOf("publisher"))
    private val viewer =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000411"), "local-viewer@example.local", listOf("viewer"))
    private val internal =
        Actor(
            UUID.fromString("01900000-0000-4000-8000-000000000413"),
            "internal@example.local",
            emptyList(),
            listOf("amendment:write"),
        )

    @BeforeEach
    fun stubIdentity() {
        Mockito.reset(identityClient, contentClient, catalogClient)
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(editor)
        Mockito.`when`(identityClient.authenticate(PUBLISHER_TOKEN)).thenReturn(publisher)
        Mockito.`when`(identityClient.authenticate(VIEWER_TOKEN)).thenReturn(viewer)
        Mockito.`when`(identityClient.authenticate(INTERNAL_TOKEN)).thenReturn(internal)
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
    fun recordTransitionReturns410() {
        mockMvc.post("/transitions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = transitionJson(SOURCE_ID, TARGET_ID)
        }.andExpect {
            status { isGone() }
            jsonPath("$.code") { value("use_amendment_write_api") }
        }
    }

    @Test
    fun suggestRequiresBearer() {
        mockMvc.post("/amendments/suggest") {
            contentType = MediaType.APPLICATION_JSON
            content = suggestJson(SOURCE_ID, TARGET_ID)
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun suggestRejectsViewer() {
        mockMvc.post("/amendments/suggest") {
            header("Authorization", VIEWER_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = suggestJson(SOURCE_ID, TARGET_ID)
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun suggestRejectsSameVersionIds() {
        mockMvc.post("/amendments/suggest") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = suggestJson(SOURCE_ID, SOURCE_ID)
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun suggestReturnsEmptyWhenTreesMatch() {
        Mockito.`when`(contentClient.listArticles(SOURCE_ID)).thenReturn(emptyList())
        Mockito.`when`(contentClient.listArticles(TARGET_ID)).thenReturn(emptyList())

        mockMvc.post("/amendments/suggest") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = suggestJson(SOURCE_ID, TARGET_ID)
        }.andExpect {
            status { isOk() }
            jsonPath("$.changes.length()") { value(0) }
        }
    }

    @Test
    fun suggestComputesAddedChangedRemoved() {
        Mockito.`when`(contentClient.listArticles(SOURCE_ID)).thenReturn(sourceArticles())
        Mockito.`when`(contentClient.listArticles(TARGET_ID)).thenReturn(targetArticles())

        mockMvc.post("/amendments/suggest") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = suggestJson(SOURCE_ID, TARGET_ID)
        }.andExpect {
            status { isOk() }
            jsonPath("$.changes.length()") { value(4) }
            jsonPath("$.changes[0].changeType") { value("added") }
            jsonPath("$.changes[0].nodeId") { value(PARAGRAPH_2_TARGET.toString()) }
            jsonPath("$.changes[0].articleNumber") { value("1") }
            jsonPath("$.changes[0].note") { value("Added (2)") }
            jsonPath("$.changes[1].changeType") { value("added") }
            jsonPath("$.changes[1].nodeId") { value(ARTICLE_16A_TARGET.toString()) }
            jsonPath("$.changes[2].changeType") { value("changed") }
            jsonPath("$.changes[2].nodeId") { value(ARTICLE_1_TARGET.toString()) }
            jsonPath("$.changes[3].changeType") { value("removed") }
            jsonPath("$.changes[3].nodeId") { value(ARTICLE_2_SOURCE.toString()) }
        }
    }

    @Test
    fun curatedAmendmentLifecycle() {
        val initialCount =
            objectMapper.readTree(
                mockMvc.get("/constitutions/$CONSTITUTION_ID/amendments")
                    .andExpect { status { isOk() } }
                    .andReturn()
                    .response
                    .contentAsString,
            ).size()

        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("Draft law title")
            }.andExpect {
                status { isCreated() }
                jsonPath("$.status") { value("draft") }
                jsonPath("$.title") { value("Draft law title") }
            }.andReturn()

        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()

        mockMvc.get("/constitutions/$CONSTITUTION_ID/amendments").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(initialCount) }
        }

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("published") }
        }

        mockMvc.get("/constitutions/$CONSTITUTION_ID/amendments").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(initialCount + 1) }
            jsonPath("$[?(@.title == 'Draft law title')]") { isNotEmpty() }
        }
    }

    @Test
    fun secondRevisionThenPublishReplacesPublicTitle() {
        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("First title")
            }.andExpect { status { isCreated() } }
                .andReturn()
        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.post("/amendments/$amendmentId/revisions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = createAmendmentJson("Revised title")
        }.andExpect { status { isOk() } }

        mockMvc.get("/amendments/$amendmentId").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("First title") }
        }

        mockMvc.get("/amendments/$amendmentId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Revised title") }
            jsonPath("$.status") { value("published") }
        }

        val publishedRevisionId =
            objectMapper.readTree(
                mockMvc.get("/amendments/$amendmentId") {
                    header("Authorization", TOKEN)
                }.andExpect { status { isOk() } }
                    .andReturn()
                    .response
                    .contentAsString,
            ).get("publishedRevisionId").asText()

        mockMvc.get("/amendments/$amendmentId/revisions") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].id") { value(publishedRevisionId) }
            jsonPath("$[0].title") { value("First title") }
            jsonPath("$[1].title") { value("Revised title") }
        }

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.get("/amendments/$amendmentId").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Revised title") }
        }
    }

    @Test
    fun withdrawHidesFromPublicGet() {
        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("To withdraw")
            }.andExpect { status { isCreated() } }
                .andReturn()
        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.post("/amendments/$amendmentId/withdraw") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("withdrawn") }
        }

        mockMvc.get("/constitutions/$CONSTITUTION_ID/amendments").andExpect {
            status { isOk() }
            jsonPath("$[?(@.title == 'To withdraw')]") { isEmpty() }
        }

        mockMvc.get("/amendments/$amendmentId").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun createAmendmentRejectsViewer() {
        mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", VIEWER_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = createAmendmentJson("Blocked")
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun publishAndWithdrawRequirePublisher() {
        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("Role gate")
            }.andExpect { status { isCreated() } }
                .andReturn()
        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", TOKEN)
        }.andExpect { status { isForbidden() } }

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.post("/amendments/$amendmentId/withdraw") {
            header("Authorization", TOKEN)
        }.andExpect { status { isForbidden() } }

        mockMvc.post("/amendments/$amendmentId/withdraw") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }
    }

    @Test
    fun republishAtSameTipReturns409() {
        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("Already public")
            }.andExpect { status { isCreated() } }
                .andReturn()
        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isConflict() } }
    }

    @Test
    fun getPublishedSeedAmendment() {
        mockMvc.get("/amendments/01900000-0000-4000-8000-000000000302").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("published") }
            jsonPath("$.title") { value("Post-1949 Basic Law revisions (seed)") }
            jsonPath("$.comment") {
                value(
                    "Demo change set between the 1949 snapshot and the 2022 snapshot: expanded Article 1, added asylum and EU provisions, and tightened the eternity clause.",
                )
            }
            jsonPath("$.documents[0].url") { value("BGBl. I 2022") }
            jsonPath("$.kind") { doesNotExist() }
            jsonPath("$.reviewStatus") { doesNotExist() }
        }
    }

    @Test
    fun getDraftAmendmentReturns404ForAnonymous() {
        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("Hidden draft")
            }.andExpect { status { isCreated() } }
                .andReturn()
        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()

        mockMvc.get("/amendments/$amendmentId").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun listRevisionsRequiresEditorialRole() {
        val seedId = "01900000-0000-4000-8000-000000000302"

        mockMvc.get("/amendments/$seedId/revisions").andExpect {
            status { isUnauthorized() }
        }

        mockMvc.get("/amendments/$seedId/revisions") {
            header("Authorization", VIEWER_TOKEN)
        }.andExpect {
            status { isForbidden() }
        }

        mockMvc.get("/amendments/$seedId/revisions") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].title") { value("Post-1949 Basic Law revisions (seed)") }
            jsonPath("$[0].comment") { exists() }
        }
    }

    @Test
    fun staffCanReadDraftAndListStatusAll() {
        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("Staff draft")
            }.andExpect { status { isCreated() } }
                .andReturn()
        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()

        mockMvc.get("/amendments/$amendmentId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("draft") }
            jsonPath("$.title") { value("Staff draft") }
        }

        mockMvc.get("/constitutions/$CONSTITUTION_ID/amendments") {
            param("status", "all")
        }.andExpect { status { isUnauthorized() } }

        mockMvc.get("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", VIEWER_TOKEN)
            param("status", "all")
        }.andExpect { status { isForbidden() } }

        mockMvc.get("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", TOKEN)
            param("status", "all")
        }.andExpect {
            status { isOk() }
            jsonPath("$[?(@.title == 'Staff draft')]") { isNotEmpty() }
        }
    }

    @Test
    fun linkTargetThenPublishShowsTargetVersion() {
        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("Linked law")
            }.andExpect { status { isCreated() } }
                .andReturn()
        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()
        val targetVersionId = UUID.fromString("01900000-0000-4000-8000-000000000904")
        val sourceVersionId = UUID.fromString("01900000-0000-4000-8000-000000000903")

        mockMvc.post("/amendments/$amendmentId/link-target") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"sourceVersionId":"$sourceVersionId","targetVersionId":"$targetVersionId"}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.get("/amendments/$amendmentId").andExpect {
            status { isOk() }
            jsonPath("$.targetVersionId") { value(targetVersionId.toString()) }
            jsonPath("$.sourceVersionId") { value(sourceVersionId.toString()) }
        }
    }

    @Test
    fun createAmendmentRejectsKind() {
        mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = createAmendmentJson("With kind", includeKind = true)
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("kind is not accepted") }
        }
    }

    @Test
    fun appendRevisionRejectsKind() {
        val createResponse =
            mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                header("Authorization", TOKEN)
                contentType = MediaType.APPLICATION_JSON
                content = createAmendmentJson("Kind on revision")
            }.andExpect { status { isCreated() } }
                .andReturn()
        val amendmentId = objectMapper.readTree(createResponse.response.contentAsString).get("id").asText()

        mockMvc.post("/amendments/$amendmentId/revisions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = createAmendmentJson("Kind on revision", includeKind = true)
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("kind is not accepted") }
        }
    }

    @Test
    fun twoPublishedRecordsCannotShareASourcePin() {
        val sourceVersionId = UUID.fromString("01900000-0000-4000-8000-000000000940")
        val firstTarget = UUID.fromString("01900000-0000-4000-8000-000000000941")
        val secondTarget = UUID.fromString("01900000-0000-4000-8000-000000000942")

        val firstId =
            objectMapper.readTree(
                mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                    header("Authorization", TOKEN)
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        createAmendmentJson(
                            "First pin owner",
                            sourceVersionId = sourceVersionId,
                            targetVersionId = firstTarget,
                        )
                }.andExpect { status { isCreated() } }
                    .andReturn()
                    .response
                    .contentAsString,
            ).get("id").asText()

        mockMvc.post("/amendments/$firstId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        val secondId =
            objectMapper.readTree(
                mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                    header("Authorization", TOKEN)
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        createAmendmentJson(
                            "Second pin owner",
                            sourceVersionId = sourceVersionId,
                            targetVersionId = secondTarget,
                        )
                }.andExpect { status { isCreated() } }
                    .andReturn()
                    .response
                    .contentAsString,
            ).get("id").asText()

        mockMvc.post("/amendments/$secondId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("source_pin_taken") }
        }
    }

    @Test
    fun refreshReviewStatusFlagsMismatchWithoutChangingPublicGet() {
        val legalVersionId = UUID.fromString("01900000-0000-4000-8000-000000000003")
        val pinnedSource = legalVersionId
        val liveTip = UUID.fromString("01900000-0000-4000-8000-000000000993")
        val seedId = "01900000-0000-4000-8000-000000000302"

        Mockito.`when`(catalogClient.getVersion(legalVersionId)).thenReturn(
            CatalogVersionRef(
                id = legalVersionId,
                constitutionId = CONSTITUTION_ID,
                legalVersionId = legalVersionId,
                currentVersionId = liveTip,
            ),
        )
        Mockito.`when`(catalogClient.getVersion(pinnedSource)).thenReturn(
            CatalogVersionRef(
                id = pinnedSource,
                constitutionId = CONSTITUTION_ID,
                legalVersionId = legalVersionId,
                currentVersionId = liveTip,
            ),
        )

        val before =
            mockMvc.get("/amendments/$seedId")
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString

        mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments/refresh-review-status") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"legalVersionId":"$legalVersionId"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.flaggedAmendmentIds") { isNotEmpty() }
        }

        val afterRefresh =
            mockMvc.get("/amendments/$seedId")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.reviewStatus") { doesNotExist() }
                }
                .andReturn()
                .response
                .contentAsString
        check(before == afterRefresh)

        mockMvc.get("/amendments/$seedId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.reviewStatus") { value("needs_review") }
            jsonPath("$.title") { value("Post-1949 Basic Law revisions (seed)") }
        }

        mockMvc.get("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", TOKEN)
            param("reviewStatus", "needs_review")
        }.andExpect {
            status { isOk() }
            jsonPath("$[?(@.id == '$seedId')]") { isNotEmpty() }
        }
    }

    @Test
    fun publicGetUnchangedUntilNewRevisionIsPublished() {
        val sourceVersionId = UUID.fromString("01900000-0000-4000-8000-000000000950")
        val targetVersionId = UUID.fromString("01900000-0000-4000-8000-000000000951")
        val liveTip = UUID.fromString("01900000-0000-4000-8000-000000000952")

        val amendmentId =
            objectMapper.readTree(
                mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                    header("Authorization", TOKEN)
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        createAmendmentJson(
                            "Pinned record",
                            comment = "Original comment",
                            sourceVersionId = sourceVersionId,
                            targetVersionId = targetVersionId,
                        )
                }.andExpect { status { isCreated() } }
                    .andReturn()
                    .response
                    .contentAsString,
            ).get("id").asText()

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        Mockito.`when`(catalogClient.getVersion(sourceVersionId)).thenReturn(
            CatalogVersionRef(
                id = sourceVersionId,
                constitutionId = CONSTITUTION_ID,
                legalVersionId = sourceVersionId,
                currentVersionId = liveTip,
            ),
        )

        val published =
            mockMvc.get("/amendments/$amendmentId")
                .andExpect {
                    status { isOk() }
                    jsonPath("$.comment") { value("Original comment") }
                }
                .andReturn()
                .response
                .contentAsString

        mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments/refresh-review-status") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"legalVersionId":"$sourceVersionId"}"""
        }.andExpect { status { isOk() } }

        val afterRefresh =
            mockMvc.get("/amendments/$amendmentId")
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
        check(published == afterRefresh)

        mockMvc.post("/amendments/$amendmentId/revisions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content =
                createAmendmentJson(
                    "Pinned record revised",
                    comment = "New comment",
                    sourceVersionId = sourceVersionId,
                    targetVersionId = targetVersionId,
                )
        }.andExpect { status { isOk() } }

        val afterDraft =
            mockMvc.get("/amendments/$amendmentId")
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
        check(published == afterDraft)

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.get("/amendments/$amendmentId").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Pinned record revised") }
            jsonPath("$.comment") { value("New comment") }
        }
    }

    @Test
    fun refreshReviewStatusAllowsInternalToken() {
        val legalVersionId = UUID.fromString("01900000-0000-4000-8000-000000000004")
        Mockito.`when`(catalogClient.getVersion(legalVersionId)).thenReturn(
            CatalogVersionRef(
                id = legalVersionId,
                constitutionId = CONSTITUTION_ID,
                legalVersionId = legalVersionId,
                currentVersionId = legalVersionId,
            ),
        )

        mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments/refresh-review-status") {
            header("Authorization", INTERNAL_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"legalVersionId":"$legalVersionId"}"""
        }.andExpect { status { isOk() } }
    }

    @Test
    fun refreshReviewStatusRejectsViewer() {
        mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments/refresh-review-status") {
            header("Authorization", VIEWER_TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"legalVersionId":"01900000-0000-4000-8000-000000000003"}"""
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun publishWithSamePinsKeepsNeedsReview() {
        val sourceVersionId = UUID.fromString("01900000-0000-4000-8000-000000000960")
        val targetVersionId = UUID.fromString("01900000-0000-4000-8000-000000000961")
        val liveTip = UUID.fromString("01900000-0000-4000-8000-000000000962")

        val amendmentId =
            objectMapper.readTree(
                mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                    header("Authorization", TOKEN)
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        createAmendmentJson(
                            "Stale pins",
                            comment = "Original",
                            sourceVersionId = sourceVersionId,
                            targetVersionId = targetVersionId,
                        )
                }.andExpect { status { isCreated() } }
                    .andReturn()
                    .response
                    .contentAsString,
            ).get("id").asText()

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        Mockito.`when`(catalogClient.getVersion(sourceVersionId)).thenReturn(
            CatalogVersionRef(
                id = sourceVersionId,
                constitutionId = CONSTITUTION_ID,
                legalVersionId = sourceVersionId,
                currentVersionId = liveTip,
            ),
        )

        mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments/refresh-review-status") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"legalVersionId":"$sourceVersionId"}"""
        }.andExpect { status { isOk() } }

        mockMvc.post("/amendments/$amendmentId/revisions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content =
                createAmendmentJson(
                    "Stale pins",
                    comment = "Comment-only edit",
                    sourceVersionId = sourceVersionId,
                    targetVersionId = targetVersionId,
                )
        }.andExpect { status { isOk() } }

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.get("/amendments/$amendmentId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.comment") { value("Comment-only edit") }
            jsonPath("$.reviewStatus") { value("needs_review") }
        }

        mockMvc.post("/amendments/$amendmentId/revisions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content =
                createAmendmentJson(
                    "Stale pins",
                    comment = "Re-pinned",
                    sourceVersionId = liveTip,
                    targetVersionId = targetVersionId,
                )
        }.andExpect { status { isOk() } }

        mockMvc.post("/amendments/$amendmentId/publish") {
            header("Authorization", PUBLISHER_TOKEN)
        }.andExpect { status { isOk() } }

        mockMvc.get("/amendments/$amendmentId") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.reviewStatus") { value("ok") }
        }
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private const val PUBLISHER_TOKEN = "Bearer publisher-token"
        private const val VIEWER_TOKEN = "Bearer viewer-token"
        private const val INTERNAL_TOKEN = "Bearer internal-token"
        private val CONSTITUTION_ID = UUID.fromString("01900000-0000-4000-8000-000000000002")
        private val SOURCE_ID = UUID.fromString("01900000-0000-4000-8000-000000000901")
        private val TARGET_ID = UUID.fromString("01900000-0000-4000-8000-000000000902")
        private val ARTICLE_1_SOURCE = UUID.fromString("01900000-0000-4000-8000-000000000911")
        private val ARTICLE_1_TARGET = UUID.fromString("01900000-0000-4000-8000-000000000921")
        private val PARAGRAPH_1_SOURCE = UUID.fromString("01900000-0000-4000-8000-000000000912")
        private val PARAGRAPH_1_TARGET = UUID.fromString("01900000-0000-4000-8000-000000000922")
        private val PARAGRAPH_2_TARGET = UUID.fromString("01900000-0000-4000-8000-000000000923")
        private val ARTICLE_2_SOURCE = UUID.fromString("01900000-0000-4000-8000-000000000913")
        private val ARTICLE_16A_TARGET = UUID.fromString("01900000-0000-4000-8000-000000000924")

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

        private fun suggestJson(source: UUID, target: UUID): String =
            """{"sourceVersionId":"$source","targetVersionId":"$target"}"""

        private fun sourceArticles(): List<ContentTreeArticle> =
            listOf(
                ContentTreeArticle(
                    id = ARTICLE_1_SOURCE,
                    versionId = SOURCE_ID,
                    articleNumber = "1",
                    title = "Human dignity",
                    sortOrder = 1,
                    body = "Old body",
                    children =
                    listOf(
                        ContentTreeNode(
                            id = PARAGRAPH_1_SOURCE,
                            kind = "paragraph",
                            label = "(1)",
                            number = "(1)",
                            body = "Old para",
                        ),
                    ),
                ),
                ContentTreeArticle(
                    id = ARTICLE_2_SOURCE,
                    versionId = SOURCE_ID,
                    articleNumber = "2",
                    title = "Freedom",
                    sortOrder = 2,
                    body = "Freedom body",
                ),
            )

        private fun targetArticles(): List<ContentTreeArticle> =
            listOf(
                ContentTreeArticle(
                    id = ARTICLE_1_TARGET,
                    versionId = TARGET_ID,
                    articleNumber = "1",
                    title = "Human dignity",
                    sortOrder = 1,
                    body = "New body",
                    children =
                    listOf(
                        ContentTreeNode(
                            id = PARAGRAPH_1_TARGET,
                            kind = "paragraph",
                            label = "(1)",
                            number = "(1)",
                            body = "Old para",
                            predecessorId = PARAGRAPH_1_SOURCE,
                        ),
                        ContentTreeNode(
                            id = PARAGRAPH_2_TARGET,
                            kind = "paragraph",
                            label = "(2)",
                            number = "(2)",
                            body = "New para",
                        ),
                    ),
                    predecessorId = ARTICLE_1_SOURCE,
                ),
                ContentTreeArticle(
                    id = ARTICLE_16A_TARGET,
                    versionId = TARGET_ID,
                    articleNumber = "16a",
                    title = "Asylum",
                    sortOrder = 3,
                    body = "Asylum body",
                ),
            )

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

        // Callers: AmendmentApiTest write helpers. Unique test fixture. User: "Work on Sprint 36"
        private fun createAmendmentJson(
            title: String,
            comment: String = "Test comment",
            sourceVersionId: UUID? = null,
            targetVersionId: UUID? = null,
            includeKind: Boolean = false,
        ): String {
            val kindLine = if (includeKind) """"kind": "legal_amendment",""" else ""
            val sourceLine =
                if (sourceVersionId != null) """"sourceVersionId": "$sourceVersionId",""" else ""
            val targetLine =
                if (targetVersionId != null) """"targetVersionId": "$targetVersionId",""" else ""
            return """
            {
              $kindLine
              "title": "$title",
              "comment": "$comment",
              $sourceLine
              $targetLine
              "enactedOn": "2025-01-01",
              "documents": [
                { "url": "https://example.local/bgbl" }
              ],
              "changes": [
                {
                  "articleNumber": "99",
                  "changeType": "added",
                  "note": "New article"
                }
              ]
            }
            """.trimIndent()
        }
    }
}

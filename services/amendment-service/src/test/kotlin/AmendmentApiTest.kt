import com.constitutionatlas.amendment.AmendmentServiceApplication
import com.constitutionatlas.amendment.ConflictException
import com.constitutionatlas.amendment.api.AmendmentWriteRequest
import com.constitutionatlas.amendment.client.CatalogClient
import com.constitutionatlas.amendment.client.CatalogVersionRef
import com.constitutionatlas.amendment.client.ContentClient
import com.constitutionatlas.amendment.client.ContentTreeArticle
import com.constitutionatlas.amendment.client.ContentTreeNode
import com.constitutionatlas.amendment.client.ResolvedContentUnit
import com.constitutionatlas.amendment.service.AmendmentDiffDecisionWrite
import com.constitutionatlas.amendment.service.AmendmentDiffReviewService
import com.constitutionatlas.amendment.service.AmendmentService
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.OrderedEntry
import com.constitutionatlas.platform.UnauthorizedException
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

@Testcontainers
@Sql(scripts = ["/fixtures/demo_amendments.sql"], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_CLASS)
@AutoConfigureMockMvc
@SpringBootTest(classes = [AmendmentServiceApplication::class])
class AmendmentApiTest {
    @Autowired lateinit var amendments: AmendmentService

    @Autowired lateinit var diffReview: AmendmentDiffReviewService

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
    fun snapshotReviewPersistsExclusionAndRequiresReviewerAcknowledgement() {
        val sourceId = UUID.randomUUID()
        val targetId = UUID.randomUUID()
        val logical = UUID.randomUUID()
        val textLogical = UUID.randomUUID()
        fun article(version: UUID, wording: String) = ContentTreeArticle(
            UUID.randomUUID(),
            version,
            "7",
            "Rights",
            1,
            logicalId = logical,
            revisionId = UUID.randomUUID(),
            content = listOf(OrderedEntry("text", logicalId = textLogical, revisionId = UUID.randomUUID(), occurrenceId = UUID.randomUUID(), text = wording)),
        )
        Mockito.`when`(contentClient.listArticles(sourceId)).thenReturn(listOf(article(sourceId, "Before.")))
        Mockito.`when`(contentClient.listArticles(targetId)).thenReturn(listOf(article(targetId, "After.")))
        Mockito.`when`(catalogClient.getVersion(sourceId)).thenReturn(CatalogVersionRef(sourceId, currentVersionId = sourceId, publicationStatus = "published"))
        Mockito.`when`(catalogClient.getVersion(targetId)).thenReturn(CatalogVersionRef(targetId, currentVersionId = targetId, publicationStatus = "published"))
        val amendment = amendments.createAmendment(UUID.randomUUID(), AmendmentWriteRequest(title = "Law", sourceVersionId = sourceId, targetVersionId = targetId), editor)
        val review = diffReview.refresh(amendment.id)
        org.assertj.core.api.Assertions.assertThat(review.candidates.map { it.facet }).containsExactly("text_changed")
        assertThrows<ConflictException> { amendments.publishAmendment(amendment.id) }
        assertThrows<ConflictException> { diffReview.requireComplete(amendment.id) }
        val item = review.candidates.single()
        diffReview.decide(amendment.id, AmendmentDiffDecisionWrite(review.revisionId, item.key, item.fingerprint, "excluded_with_reason", exclusionReason = "Separate correction"), reviewer = false)
        assertThrows<ConflictException> { diffReview.requireComplete(amendment.id) }
        diffReview.decide(amendment.id, AmendmentDiffDecisionWrite(review.revisionId, item.key, item.fingerprint, "excluded_with_reason", exclusionReason = "Separate correction", reviewerAcknowledged = true), reviewer = true)
        diffReview.requireComplete(amendment.id)
        org.assertj.core.api.Assertions.assertThat(diffReview.refresh(amendment.id).decisions.single().reviewerAcknowledged).isTrue()
        amendments.publishAmendment(amendment.id)
    }

    @Test
    fun sourceOnlyTransitionCanPublishAfterTargetIsPinned() {
        val sourceId = UUID.randomUUID()
        val targetId = UUID.randomUUID()
        val logical = UUID.randomUUID()
        val textLogical = UUID.randomUUID()
        fun article(version: UUID, wording: String) = ContentTreeArticle(
            UUID.randomUUID(),
            version,
            "7",
            "Rights",
            1,
            logicalId = logical,
            revisionId = UUID.randomUUID(),
            content = listOf(OrderedEntry("text", logicalId = textLogical, revisionId = UUID.randomUUID(), occurrenceId = UUID.randomUUID(), text = wording)),
        )
        Mockito.`when`(contentClient.listArticles(sourceId)).thenReturn(listOf(article(sourceId, "Before.")))
        Mockito.`when`(contentClient.listArticles(targetId)).thenReturn(listOf(article(targetId, "After.")))
        Mockito.`when`(catalogClient.getVersion(sourceId)).thenReturn(CatalogVersionRef(sourceId, currentVersionId = sourceId, publicationStatus = "published"))
        Mockito.`when`(catalogClient.getVersion(targetId)).thenReturn(CatalogVersionRef(targetId, currentVersionId = targetId, publicationStatus = "published"))
        val transition = amendments.createAmendment(UUID.randomUUID(), AmendmentWriteRequest(title = "Successor law", sourceVersionId = sourceId), editor)
        amendments.appendRevision(transition.id, AmendmentWriteRequest(title = "Successor law", sourceVersionId = sourceId, targetVersionId = targetId), editor)
        amendments.publishAmendment(transition.id)
    }

    @Test
    fun publisherCanConfirmLiveQuotesAfterReviewedSnapshotDiff() {
        val sourceId = UUID.randomUUID()
        val targetId = UUID.randomUUID()
        val sourceTip = UUID.randomUUID()
        val logical = UUID.randomUUID()
        val textLogical = UUID.randomUUID()
        fun article(version: UUID, wording: String) = ContentTreeArticle(
            UUID.randomUUID(),
            version,
            "7",
            "Rights",
            1,
            logicalId = logical,
            revisionId = UUID.randomUUID(),
            content = listOf(OrderedEntry("text", logicalId = textLogical, revisionId = UUID.randomUUID(), occurrenceId = UUID.randomUUID(), text = wording)),
        )
        Mockito.`when`(contentClient.listArticles(sourceId)).thenReturn(listOf(article(sourceId, "Before.")))
        Mockito.`when`(contentClient.listArticles(targetId)).thenReturn(listOf(article(targetId, "After.")))
        Mockito.`when`(contentClient.listArticles(sourceTip)).thenReturn(listOf(article(sourceTip, "Corrected before.")))
        Mockito.`when`(catalogClient.getVersion(sourceId)).thenReturn(CatalogVersionRef(sourceId, currentVersionId = sourceId, publicationStatus = "published"))
        Mockito.`when`(catalogClient.getVersion(targetId)).thenReturn(CatalogVersionRef(targetId, currentVersionId = targetId, publicationStatus = "published"))
        val amendment = amendments.createAmendment(UUID.randomUUID(), AmendmentWriteRequest(title = "Quoted law", sourceVersionId = sourceId, targetVersionId = targetId), editor)
        val review = diffReview.refresh(amendment.id)
        review.candidates.forEach { item ->
            diffReview.decide(amendment.id, AmendmentDiffDecisionWrite(review.revisionId, item.key, item.fingerprint, "excluded_with_reason", exclusionReason = "Separate correction", reviewerAcknowledged = true), reviewer = true)
        }
        amendments.publishAmendment(amendment.id)
        Mockito.`when`(catalogClient.getVersion(sourceId)).thenReturn(CatalogVersionRef(sourceId, currentVersionId = sourceTip, publicationStatus = "published"))
        Mockito.`when`(catalogClient.getVersion(sourceTip)).thenReturn(CatalogVersionRef(sourceTip, currentVersionId = sourceTip, publicationStatus = "published"))
        assertEquals(sourceTip, amendments.confirmQuotes(amendment.id, publisher).sourceVersionId)
    }

    @Test
    fun publishAttemptRetriesReturnSameChangeRecordAndRejectPayloadChanges() {
        val attempt = UUID.randomUUID()
        fun request(title: String): String = objectMapper.readTree(createAmendmentJson(title)).also { (it as com.fasterxml.jackson.databind.node.ObjectNode).put("publishAttemptId", attempt.toString()) }.toString()
        fun create(title: String) = mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = request(title)
        }
        val first = create("Reserved publication").andExpect { status { isCreated() } }.andReturn()
        val retried = create("Reserved publication").andExpect { status { isCreated() } }.andReturn()
        val original = objectMapper.readTree(first.response.contentAsString)
        val repeated = objectMapper.readTree(retried.response.contentAsString)
        org.junit.jupiter.api.Assertions.assertEquals(original.get("id"), repeated.get("id"))
        org.junit.jupiter.api.Assertions.assertEquals(original.get("revisionId"), repeated.get("revisionId"))
        create("Changed publication").andExpect { status { isConflict() } }
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
            jsonPath("$.algorithmVersion") { value("hierarchical-1") }
            jsonPath("$.diffItems.length()") { isNotEmpty() }
            jsonPath("$.diffItems[0].key") { isNotEmpty() }
            jsonPath("$.diffItems[0].fingerprint") { isNotEmpty() }
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

        mockMvc.get("/amendments/$amendmentId") { header("Authorization", PUBLISHER_TOKEN) }.andExpect {
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
        mockMvc.get("/amendments/$amendmentId") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("withdrawn") }
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

        mockMvc.get("/amendments/$amendmentId") { header("Authorization", PUBLISHER_TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.targetVersionId") { value(targetVersionId.toString()) }
            jsonPath("$.sourceVersionId") { value(sourceVersionId.toString()) }
        }
    }

    @Test
    fun exactBeforeAndAfterUnitReferencesSurviveSaveAndPublish() {
        val sourceVersion = UUID.randomUUID()
        val targetVersion = UUID.randomUUID()
        fun ref(versionId: UUID, logicalId: UUID, occurrenceId: UUID, revisionId: UUID) =
            ResolvedContentUnit(
                versionId = versionId,
                constitutionId = CONSTITUTION_ID,
                logicalId = logicalId,
                revisionId = revisionId,
                occurrenceId = occurrenceId,
                rootOccurrenceId = UUID.randomUUID(),
                kind = "sentence",
                articleNumber = "1",
                text = "Exact wording",
                deepLink = "/versions/$versionId/units/root?occurrenceId=$occurrenceId",
                pathLabels = listOf("Article 1", "Sentence (1)"),
            )

        val sourceChanged = UUID.randomUUID()
        val addedLogical = UUID.randomUUID()
        val removedLogical = UUID.randomUUID()
        val sourceChangedRef = ref(sourceVersion, sourceChanged, UUID.randomUUID(), UUID.randomUUID())
        val targetChangedRef = ref(targetVersion, sourceChanged, UUID.randomUUID(), UUID.randomUUID())
        val addedRef = ref(targetVersion, addedLogical, UUID.randomUUID(), UUID.randomUUID())
        val removedRef = ref(sourceVersion, removedLogical, UUID.randomUUID(), UUID.randomUUID())
        listOf(sourceChangedRef, targetChangedRef, addedRef, removedRef).forEach { resolved ->
            Mockito.`when`(contentClient.resolve(resolved.versionId, resolved.logicalId)).thenReturn(resolved)
        }

        val json = """
            {
              "title":"Exact links", "comment":"Reviewed", "sourceVersionId":"$sourceVersion", "targetVersionId":"$targetVersion",
              "changes":[
                {"changeType":"changed","beforeRef":{"versionId":"$sourceVersion","logicalId":"$sourceChanged","occurrenceId":"${sourceChangedRef.occurrenceId}","revisionId":"${sourceChangedRef.revisionId}","rootOccurrenceId":"${sourceChangedRef.rootOccurrenceId}","unitKind":"node"},"afterRef":{"versionId":"$targetVersion","logicalId":"$sourceChanged","occurrenceId":"${targetChangedRef.occurrenceId}","revisionId":"${targetChangedRef.revisionId}","rootOccurrenceId":"${targetChangedRef.rootOccurrenceId}","unitKind":"node"}},
                {"changeType":"added","afterRef":{"versionId":"$targetVersion","logicalId":"$addedLogical","occurrenceId":"${addedRef.occurrenceId}","revisionId":"${addedRef.revisionId}","rootOccurrenceId":"${addedRef.rootOccurrenceId}","unitKind":"node"}},
                {"changeType":"removed","beforeRef":{"versionId":"$sourceVersion","logicalId":"$removedLogical","occurrenceId":"${removedRef.occurrenceId}","revisionId":"${removedRef.revisionId}","rootOccurrenceId":"${removedRef.rootOccurrenceId}","unitKind":"node"}}
              ]
            }
        """.trimIndent()
        val created = mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = json
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val amendmentId = objectMapper.readTree(created).get("id").asText()
        mockMvc.post("/amendments/$amendmentId/publish") { header("Authorization", PUBLISHER_TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.changes.length()") { value(3) }
        }
        val published = mockMvc.get("/amendments/$amendmentId") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect { status { isOk() } }.andReturn().response.contentAsString
        val changes = objectMapper.readTree(published).get("changes").associateBy { it.get("changeType").asText() }
        val changed = requireNotNull(changes["changed"])
        assertEquals(sourceVersion.toString(), changed.get("beforeRef").get("versionId").asText())
        assertEquals(targetVersion.toString(), changed.get("afterRef").get("versionId").asText())
        val added = requireNotNull(changes["added"])
        assertFalse(added.has("beforeRef"))
        assertEquals(addedRef.occurrenceId.toString(), added.get("afterRef").get("occurrenceId").asText())
        val removed = requireNotNull(changes["removed"])
        assertFalse(removed.has("afterRef"))
        assertEquals(removedRef.occurrenceId.toString(), removed.get("beforeRef").get("occurrenceId").asText())
    }

    @Test
    fun publishRejectsMixedExactAndUnlinkedChanges() {
        val targetVersion = UUID.randomUUID()
        val logicalId = UUID.randomUUID()
        val resolved = ResolvedContentUnit(
            versionId = targetVersion,
            constitutionId = CONSTITUTION_ID,
            logicalId = logicalId,
            revisionId = UUID.randomUUID(),
            occurrenceId = UUID.randomUUID(),
            rootOccurrenceId = UUID.randomUUID(),
            kind = "sentence",
            articleNumber = "1",
            text = "Added wording",
            deepLink = "/versions/$targetVersion/units/$logicalId",
        )
        Mockito.`when`(contentClient.resolve(targetVersion, logicalId)).thenReturn(resolved)
        val body = """
            {"title":"Mixed links","comment":"Review","targetVersionId":"$targetVersion","changes":[
              {"changeType":"added","afterRef":{"versionId":"$targetVersion","logicalId":"$logicalId","occurrenceId":"${resolved.occurrenceId}","rootOccurrenceId":"${resolved.rootOccurrenceId}","revisionId":"${resolved.revisionId}","unitKind":"node"}},
              {"changeType":"changed","articleNumber":"2"}
            ]}
        """.trimIndent()
        val created = mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val id = objectMapper.readTree(created).get("id").asText()
        mockMvc.post("/amendments/$id/publish") { header("Authorization", PUBLISHER_TOKEN) }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun draftTargetLogicalUnitIsResolvedAfterLegalPublish() {
        val sourceVersion = UUID.randomUUID()
        val targetVersion = UUID.randomUUID()
        val logicalId = UUID.randomUUID()
        fun resolved(versionId: UUID, occurrenceId: UUID, revisionId: UUID) =
            ResolvedContentUnit(
                versionId = versionId,
                constitutionId = CONSTITUTION_ID,
                logicalId = logicalId,
                revisionId = revisionId,
                occurrenceId = occurrenceId,
                rootOccurrenceId = UUID.randomUUID(),
                kind = "sentence",
                articleNumber = "1",
                text = "Updated",
                deepLink = "/versions/$versionId/units/root?occurrenceId=$occurrenceId",
                pathLabels = listOf("Article 1", "Sentence (1)"),
            )
        val before = resolved(sourceVersion, UUID.randomUUID(), UUID.randomUUID())
        val after = resolved(targetVersion, UUID.randomUUID(), UUID.randomUUID())
        Mockito.`when`(contentClient.resolve(sourceVersion, logicalId)).thenReturn(before)
        Mockito.`when`(contentClient.resolve(targetVersion, logicalId)).thenReturn(after)
        val body = """
            {"title":"Pending target","comment":"Review","sourceVersionId":"$sourceVersion","changes":[
              {"changeType":"changed","beforeRef":{"versionId":"$sourceVersion","logicalId":"$logicalId","occurrenceId":"${before.occurrenceId}","revisionId":"${before.revisionId}","rootOccurrenceId":"${before.rootOccurrenceId}","unitKind":"node"},"pendingAfterLogicalId":"$logicalId"}
            ]}
        """.trimIndent()
        val created = mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        val id = objectMapper.readTree(created).get("id").asText()

        mockMvc.post("/amendments/$id/link-target") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"sourceVersionId":"$sourceVersion","targetVersionId":"$targetVersion"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.changes[0].beforeRef.occurrenceId") { value(before.occurrenceId.toString()) }
            jsonPath("$.changes[0].afterRef.occurrenceId") { value(after.occurrenceId.toString()) }
            jsonPath("$.changes[0].pendingAfterLogicalId") { doesNotExist() }
        }
        mockMvc.get("/amendments/$id") { header("Authorization", TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.changes[0].afterRef.logicalId") { value(logicalId.toString()) }
            jsonPath("$.changes[0].afterRef.versionId") { value(targetVersion.toString()) }
        }
        mockMvc.post("/amendments/$id/publish") { header("Authorization", PUBLISHER_TOKEN) }.andExpect {
            status { isOk() }
            jsonPath("$.changes[0].afterRef.revisionId") { value(after.revisionId.toString()) }
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
    fun confirmQuotesRepublishesThePublishedRevisionAtLiveTips() {
        val source = UUID.fromString("01900000-0000-4000-8000-000000000941")
        val target = UUID.fromString("01900000-0000-4000-8000-000000000942")
        val sourceTip = UUID.fromString("01900000-0000-4000-8000-000000000943")
        val targetTip = UUID.fromString("01900000-0000-4000-8000-000000000944")
        val amendmentId =
            objectMapper.readTree(
                mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                    header("Authorization", TOKEN)
                    contentType = MediaType.APPLICATION_JSON
                    content = createAmendmentJson("Quoted record", comment = "Checked", sourceVersionId = source, targetVersionId = target)
                }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
            ).get("id").asText()
        mockMvc.post("/amendments/$amendmentId/publish") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect { status { isOk() } }
        Mockito.`when`(catalogClient.getVersion(source)).thenReturn(CatalogVersionRef(source, CONSTITUTION_ID, source, sourceTip))
        Mockito.`when`(catalogClient.getVersion(target)).thenReturn(CatalogVersionRef(target, CONSTITUTION_ID, target, targetTip))

        mockMvc.post("/amendments/$amendmentId/confirm-quotes") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.sourceVersionId") { value(sourceTip.toString()) }
                jsonPath("$.targetVersionId") { value(targetTip.toString()) }
                jsonPath("$.comment") { value("Checked") }
            }
    }

    @Test
    fun confirmQuotesDoesNotPublishAnUnrelatedStaffDraft() {
        val amendmentId =
            objectMapper.readTree(
                mockMvc.post("/constitutions/$CONSTITUTION_ID/amendments") {
                    header("Authorization", TOKEN)
                    contentType = MediaType.APPLICATION_JSON
                    content = createAmendmentJson("Published record", sourceVersionId = SOURCE_ID, targetVersionId = TARGET_ID)
                }.andExpect { status { isCreated() } }.andReturn().response.contentAsString,
            ).get("id").asText()
        mockMvc.post("/amendments/$amendmentId/publish") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect { status { isOk() } }
        mockMvc.post("/amendments/$amendmentId/revisions") {
            header("Authorization", TOKEN)
            contentType = MediaType.APPLICATION_JSON
            content = createAmendmentJson("Unpublished edit", sourceVersionId = SOURCE_ID, targetVersionId = TARGET_ID)
        }.andExpect { status { isOk() } }
        Mockito.`when`(catalogClient.getVersion(SOURCE_ID))
            .thenReturn(CatalogVersionRef(SOURCE_ID, CONSTITUTION_ID, SOURCE_ID, SOURCE_ID))
        Mockito.`when`(catalogClient.getVersion(TARGET_ID))
            .thenReturn(CatalogVersionRef(TARGET_ID, CONSTITUTION_ID, TARGET_ID, TARGET_ID))

        mockMvc.post("/amendments/$amendmentId/confirm-quotes") { header("Authorization", PUBLISHER_TOKEN) }
            .andExpect {
                status { isOk() }
                jsonPath("$.title") { value("Published record") }
            }
        mockMvc.get("/amendments/$amendmentId").andExpect { jsonPath("$.title") { value("Published record") } }
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
        }.andExpect { status { isConflict() } }

        mockMvc.get("/amendments/$amendmentId").andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Pinned record") }
            jsonPath("$.comment") { value("Original comment") }
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
        }.andExpect { status { isConflict() } }

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

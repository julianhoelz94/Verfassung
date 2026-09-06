import com.constitutionatlas.ingestion.IngestionServiceApplication
import com.constitutionatlas.ingestion.client.CatalogClient
import com.constitutionatlas.ingestion.client.ContentClient
import com.constitutionatlas.ingestion.client.DownstreamConstitution
import com.constitutionatlas.ingestion.client.DownstreamCountry
import com.constitutionatlas.ingestion.client.DownstreamVersion
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
import org.springframework.test.web.servlet.post
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.time.LocalDate
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [IngestionServiceApplication::class])
class ImportApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockBean
    lateinit var catalogClient: CatalogClient

    @MockBean
    lateinit var contentClient: ContentClient

    @Test
    fun invalidNumberingFailsWithoutCatalogWrites() {
        mockMvc.post("/import-jobs") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "isoCode": "FR",
                  "countryName": "France",
                  "constitutionSlug": "1958",
                  "constitutionTitle": "Constitution of 1958",
                  "versionLabel": "1958",
                  "articles": [
                    {"articleNumber": "1", "title": "A", "body": "a", "sortOrder": 1},
                    {"articleNumber": "1", "title": "B", "body": "b", "sortOrder": 2}
                  ]
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("failed") }
            jsonPath("$.errors[0].code") { value("DUPLICATE_NUMBER") }
        }
        Mockito.verifyNoInteractions(catalogClient)
        Mockito.verifyNoInteractions(contentClient)
    }

    @Test
    fun validImportPublishesDraftThenArticles() {
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000501")
        val versionId = UUID.fromString("01900000-0000-4000-8000-000000000502")
        stubCatalog("FR", "France", "1958", "Constitution of 1958", "1958", constitutionId, versionId)

        mockMvc.post("/import-jobs") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "isoCode": "FR",
                  "countryName": "France",
                  "constitutionSlug": "1958",
                  "constitutionTitle": "Constitution of 1958",
                  "versionLabel": "1958",
                  "articles": [
                    {"articleNumber": "1", "title": "Sovereignty", "body": "France is a republic.", "sortOrder": 1}
                  ]
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("completed") }
            jsonPath("$.versionId") { value(versionId.toString()) }
            jsonPath("$.isoCode") { value("FR") }
        }
        Mockito.verify(catalogClient).publishVersion(versionId)
        Mockito.verify(catalogClient, Mockito.never()).replaceOutline(Mockito.any(), Mockito.anyList())
    }

    @Test
    fun treeFixtureImportAppliesOutlineAndSources() {
        val constitutionId = UUID.fromString("01900000-0000-4000-8000-000000000601")
        val versionId = UUID.fromString("01900000-0000-4000-8000-000000000602")
        stubCatalog(
            iso = "US",
            countryName = "United States",
            slug = "constitution",
            title = "Constitution of the United States",
            versionLabel = "1789",
            constitutionId = constitutionId,
            versionId = versionId,
            effectiveDate = LocalDate.parse("1789-03-04"),
            languageCode = "en",
            sourceUrl = "https://www.archives.gov/founding-docs/constitution-transcript",
            gazetteReference = "U.S. Const.",
        )

        mockMvc.post("/import-jobs") {
            contentType = MediaType.APPLICATION_JSON
            content = usFixture()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("completed") }
            jsonPath("$.versionId") { value(versionId.toString()) }
            jsonPath("$.isoCode") { value("US") }
        }
        Mockito.verify(catalogClient).replaceOutline(
            Mockito.eq(constitutionId),
            Mockito.argThat { kinds -> kinds.any { it.kindCode == "section" } },
        )
        Mockito.verify(catalogClient).createDraftVersion(
            constitutionId,
            "1789",
            LocalDate.parse("1789-03-04"),
            "en",
            "https://www.archives.gov/founding-docs/constitution-transcript",
            "U.S. Const.",
        )
        Mockito.verify(contentClient).replaceArticles(
            Mockito.eq(versionId),
            Mockito.argThat { articles -> articles.any { it.nodes.any { node -> node.kind == "section" } } },
        )
        Mockito.verify(catalogClient).publishVersion(versionId)
    }

    @Test
    fun unknownKindFailsWithoutCatalogWrites() {
        mockMvc.post("/import-jobs") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "isoCode": "US",
                  "countryName": "United States",
                  "constitutionSlug": "constitution",
                  "constitutionTitle": "Constitution of the United States",
                  "versionLabel": "1789",
                  "outline": {
                    "kinds": [
                      {"kindCode":"article","displayLabel":"Article","presentation":"section","showLabel":true,"showTitle":true,"showKind":true}
                    ]
                  },
                  "articles": [
                    {
                      "articleNumber": "I",
                      "title": "Legislative Power",
                      "body": "",
                      "sortOrder": 1,
                      "nodes": [{"kind":"chapter","body":"All legislative Powers herein granted."}]
                    }
                  ]
                }
            """.trimIndent()
        }.andExpect {
            status { isCreated() }
            jsonPath("$.status") { value("failed") }
            jsonPath("$.errors[0].code") { value("UNKNOWN_KIND") }
        }
        Mockito.verifyNoInteractions(catalogClient)
        Mockito.verifyNoInteractions(contentClient)
    }

    private fun stubCatalog(
        iso: String,
        countryName: String,
        slug: String,
        title: String,
        versionLabel: String,
        constitutionId: UUID,
        versionId: UUID,
        effectiveDate: LocalDate? = null,
        languageCode: String = "en",
        sourceUrl: String? = null,
        gazetteReference: String? = null,
    ) {
        Mockito.`when`(catalogClient.getCountry(iso)).thenReturn(null)
        Mockito.`when`(catalogClient.createCountry(iso, countryName))
            .thenReturn(DownstreamCountry(UUID.randomUUID(), iso, countryName))
        Mockito.`when`(catalogClient.findConstitution(iso, slug)).thenReturn(null)
        Mockito.`when`(catalogClient.createConstitution(iso, slug, title))
            .thenReturn(DownstreamConstitution(constitutionId, slug, title))
        Mockito.`when`(
            catalogClient.createDraftVersion(
                constitutionId,
                versionLabel,
                effectiveDate,
                languageCode,
                sourceUrl,
                gazetteReference,
            ),
        ).thenReturn(DownstreamVersion(versionId, constitutionId, "draft"))
        Mockito.`when`(catalogClient.publishVersion(versionId))
            .thenReturn(DownstreamVersion(versionId, constitutionId, "published"))
    }

    companion object {
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

        private fun usFixture(): String =
            checkNotNull(ImportApiTest::class.java.getResource("/fixtures/us-constitution.json")).readText()
    }
}

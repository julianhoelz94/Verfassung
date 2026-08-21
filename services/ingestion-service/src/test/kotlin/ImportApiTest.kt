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
        Mockito.`when`(catalogClient.getCountry("FR")).thenReturn(null)
        Mockito.`when`(catalogClient.createCountry("FR", "France"))
            .thenReturn(DownstreamCountry(UUID.randomUUID(), "FR", "France"))
        Mockito.`when`(catalogClient.findConstitution("FR", "1958")).thenReturn(null)
        Mockito.`when`(catalogClient.createConstitution("FR", "1958", "Constitution of 1958"))
            .thenReturn(DownstreamConstitution(constitutionId, "1958", "Constitution of 1958"))
        Mockito.`when`(
            catalogClient.createDraftVersion(constitutionId, "1958", null, "en", null, null),
        ).thenReturn(DownstreamVersion(versionId, constitutionId, "draft"))
        Mockito.`when`(catalogClient.publishVersion(versionId))
            .thenReturn(DownstreamVersion(versionId, constitutionId, "published"))

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
        }
        Mockito.verify(catalogClient).publishVersion(versionId)
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
    }
}

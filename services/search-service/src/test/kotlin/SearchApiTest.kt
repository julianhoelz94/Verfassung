import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import com.constitutionatlas.search.SearchServiceApplication
import com.constitutionatlas.search.client.IndexSource
import com.constitutionatlas.search.client.IndexableArticle
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
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
@SpringBootTest(classes = [SearchServiceApplication::class])
class SearchApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @MockBean
    lateinit var indexSource: IndexSource

    @MockBean
    lateinit var identityClient: IdentityClient

    private val publisher =
        Actor(UUID.fromString("01900000-0000-4000-8000-000000000412"), "local-publisher@example.local", listOf("publisher"))

    @BeforeEach
    fun stubIdentity() {
        Mockito.reset(identityClient)
        Mockito.`when`(identityClient.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identityClient.authenticate(TOKEN)).thenReturn(publisher)
    }

    @Test
    fun reindexThenKeywordSearchFindsArticleWithProvenance() {
        reindexFixture()

        mockMvc.get("/search") {
            param("q", "personality")
        }.andExpect {
            status { isOk() }
            jsonPath("$.hits.length()") { value(1) }
            jsonPath("$.total") { value(1) }
            jsonPath("$.limit") { value(20) }
            jsonPath("$.offset") { value(0) }
            jsonPath("$.hits[0].articleNumber") { value("2") }
            jsonPath("$.hits[0].title") { value("Personal freedoms") }
            jsonPath("$.hits[0].countryCode") { value("DE") }
            jsonPath("$.hits[0].constitutionTitle") { value("Basic Law for the Federal Republic of Germany") }
            jsonPath("$.hits[0].versionLabel") { value("2022") }
            jsonPath("$.hits[0].effectiveDate") { value("2022-12-19") }
            jsonPath("$.hits[0].snippet") { value(org.hamcrest.Matchers.containsString("<mark>")) }
        }
    }

    @Test
    fun searchFacetsListIndexedCountryVersionAndDate() {
        reindexFixture()

        mockMvc.get("/search/facets").andExpect {
            status { isOk() }
            jsonPath("$.countries.length()") { value(2) }
            jsonPath("$.countries[0].code") { value("DE") }
            jsonPath("$.countries[0].countryName") { value("Germany") }
            jsonPath("$.countries[1].code") { value("FR") }
            jsonPath("$.countries[1].countryName") { value("France") }
            jsonPath("$.versions.length()") { value(3) }
            jsonPath("$.dates.length()") { value(3) }
            jsonPath("$.dates[0].effectiveDate") { value("1949-05-23") }
        }
    }

    @Test
    fun facetFiltersRestrictHitsByCountryVersionAndDate() {
        reindexFixture()

        mockMvc.get("/search") {
            param("q", "dignity")
            param("country", "FR")
        }.andExpect {
            status { isOk() }
            jsonPath("$.hits.length()") { value(0) }
        }

        mockMvc.get("/search") {
            param("q", "dignity")
            param("country", "DE")
            param("versionId", DE_2022.toString())
            param("effectiveDate", "2022-12-19")
        }.andExpect {
            status { isOk() }
            jsonPath("$.hits.length()") { value(1) }
            jsonPath("$.hits[0].versionLabel") { value("2022") }
        }

        mockMvc.get("/search") {
            param("q", "dignity")
            param("versionId", DE_1949.toString())
        }.andExpect {
            status { isOk() }
            jsonPath("$.hits.length()") { value(1) }
            jsonPath("$.hits[0].versionLabel") { value("1949") }
        }

        mockMvc.get("/search") {
            param("q", "dignity")
            param("effectiveDate", "1949-05-23")
        }.andExpect {
            status { isOk() }
            jsonPath("$.hits.length()") { value(1) }
            jsonPath("$.hits[0].versionLabel") { value("1949") }
        }
    }

    @Test
    fun searchPagesWithOffsetAndTotal() {
        reindexFixture()

        mockMvc.get("/search") {
            param("q", "dignity")
            param("country", "DE")
            param("limit", "1")
            param("offset", "0")
        }.andExpect {
            status { isOk() }
            jsonPath("$.total") { value(2) }
            jsonPath("$.limit") { value(1) }
            jsonPath("$.offset") { value(0) }
            jsonPath("$.hits.length()") { value(1) }
        }

        mockMvc.get("/search") {
            param("q", "dignity")
            param("country", "DE")
            param("limit", "1")
            param("offset", "1")
        }.andExpect {
            status { isOk() }
            jsonPath("$.total") { value(2) }
            jsonPath("$.offset") { value(1) }
            jsonPath("$.hits.length()") { value(1) }
        }
    }

    @Test
    fun blankQueryReturnsEmptyPage() {
        mockMvc.get("/search").andExpect {
            status { isOk() }
            jsonPath("$.hits.length()") { value(0) }
            jsonPath("$.total") { value(0) }
            jsonPath("$.offset") { value(0) }
        }
    }

    @Test
    fun reindexRequiresIdentityBearer() {
        mockMvc.post("/reindex").andExpect { status { isUnauthorized() } }
    }

    @Test
    fun germanInflectedQueryHitsGermanBody() {
        reindexFixture()
        mockMvc.get("/search") {
            param("q", "unantastbaren")
            param("country", "DE")
        }.andExpect {
            status { isOk() }
            jsonPath("$.hits.length()") { value(1) }
            jsonPath("$.hits[0].articleNumber") { value("79") }
        }
    }

    @Test
    fun articleNumberQueryMatchesArtPrefix() {
        reindexFixture()
        mockMvc.get("/search") {
            param("q", "Art. 1")
            param("versionId", DE_2022.toString())
        }.andExpect {
            status { isOk() }
            jsonPath("$.hits[0].articleNumber") { value("1") }
        }
    }

    private fun reindexFixture() {
        Mockito.`when`(indexSource.loadPublishedArticles()).thenReturn(
            listOf(
                article(
                    articleId = UUID.fromString("01900000-0000-4000-8000-000000000201"),
                    versionId = DE_2022,
                    countryCode = "DE",
                    countryName = "Germany",
                    constitutionTitle = "Basic Law for the Federal Republic of Germany",
                    versionLabel = "2022",
                    effectiveDate = LocalDate.of(2022, 12, 19),
                    articleNumber = "1",
                    title = "Human dignity",
                    body = "Human dignity shall be inviolable.",
                ),
                article(
                    articleId = UUID.fromString("01900000-0000-4000-8000-000000000101"),
                    versionId = DE_1949,
                    countryCode = "DE",
                    countryName = "Germany",
                    constitutionTitle = "Basic Law for the Federal Republic of Germany",
                    versionLabel = "1949",
                    effectiveDate = LocalDate.of(1949, 5, 23),
                    articleNumber = "1",
                    title = "Human dignity",
                    body = "Human dignity shall be inviolable.",
                ),
                article(
                    articleId = UUID.fromString("01900000-0000-4000-8000-000000000202"),
                    versionId = DE_2022,
                    countryCode = "DE",
                    countryName = "Germany",
                    constitutionTitle = "Basic Law for the Federal Republic of Germany",
                    versionLabel = "2022",
                    effectiveDate = LocalDate.of(2022, 12, 19),
                    articleNumber = "2",
                    title = "Personal freedoms",
                    body = "Every person shall have the right to free development of their personality.",
                ),
                article(
                    articleId = UUID.fromString("01900000-0000-4000-8000-000000000209"),
                    versionId = DE_2022,
                    countryCode = "DE",
                    countryName = "Germany",
                    constitutionTitle = "Basic Law for the Federal Republic of Germany",
                    versionLabel = "2022",
                    effectiveDate = LocalDate.of(2022, 12, 19),
                    articleNumber = "79",
                    title = "Eternity clause",
                    body = "Die Würde des Menschen ist unantastbar.",
                    languageCode = "de",
                ),
                article(
                    articleId = UUID.fromString("01900000-0000-4000-8000-000000000301"),
                    versionId = FR_1958,
                    countryCode = "FR",
                    countryName = "France",
                    constitutionTitle = "Constitution of 4 October 1958",
                    versionLabel = "1958",
                    effectiveDate = LocalDate.of(1958, 10, 4),
                    articleNumber = "1",
                    title = "Republic",
                    body = "France is an indivisible republic.",
                ),
            ),
        )

        mockMvc.post("/reindex") {
            header("Authorization", TOKEN)
        }.andExpect {
            status { isOk() }
            jsonPath("$.documentCount") { value(5) }
            jsonPath("$.status") { value("ready") }
        }
    }

    companion object {
        private const val TOKEN = "Bearer test-token"
        private val DE_1949: UUID = UUID.fromString("01900000-0000-4000-8000-000000000003")
        private val DE_2022: UUID = UUID.fromString("01900000-0000-4000-8000-000000000004")
        private val FR_1958: UUID = UUID.fromString("01900000-0000-4000-8000-000000000014")

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

        private fun article(
            articleId: UUID,
            versionId: UUID,
            countryCode: String,
            countryName: String,
            constitutionTitle: String,
            versionLabel: String,
            effectiveDate: LocalDate?,
            articleNumber: String,
            title: String,
            body: String,
            languageCode: String = "en",
        ) = IndexableArticle(
            articleId = articleId,
            versionId = versionId,
            countryCode = countryCode,
            countryName = countryName,
            constitutionTitle = constitutionTitle,
            versionLabel = versionLabel,
            effectiveDate = effectiveDate,
            articleNumber = articleNumber,
            title = title,
            body = body,
            languageCode = languageCode,
        )
    }
}

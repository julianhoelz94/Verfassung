import com.constitutionatlas.search.SearchServiceApplication
import com.constitutionatlas.search.client.IndexSource
import com.constitutionatlas.search.client.IndexableArticle
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

    @Test
    fun reindexThenKeywordSearchFindsArticleWithProvenance() {
        reindexFixture()

        mockMvc.get("/search") {
            param("q", "personality")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].articleNumber") { value("2") }
            jsonPath("$[0].title") { value("Personal freedoms") }
            jsonPath("$[0].countryCode") { value("DE") }
            jsonPath("$[0].constitutionTitle") { value("Basic Law for the Federal Republic of Germany") }
            jsonPath("$[0].versionLabel") { value("2022") }
            jsonPath("$[0].effectiveDate") { value("2022-12-19") }
            jsonPath("$[0].snippet") { exists() }
        }
    }

    @Test
    fun searchFacetsListIndexedCountryVersionAndDate() {
        reindexFixture()

        mockMvc.get("/search/facets").andExpect {
            status { isOk() }
            jsonPath("$.countries.length()") { value(2) }
            jsonPath("$.countries[0].code") { value("DE") }
            jsonPath("$.countries[1].code") { value("FR") }
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
            jsonPath("$.length()") { value(0) }
        }

        mockMvc.get("/search") {
            param("q", "dignity")
            param("country", "DE")
            param("versionId", DE_2022.toString())
            param("effectiveDate", "2022-12-19")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].versionLabel") { value("2022") }
        }

        mockMvc.get("/search") {
            param("q", "dignity")
            param("versionId", DE_1949.toString())
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].versionLabel") { value("1949") }
        }

        mockMvc.get("/search") {
            param("q", "dignity")
            param("effectiveDate", "1949-05-23")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].versionLabel") { value("1949") }
        }
    }

    @Test
    fun blankQueryReturnsEmptyList() {
        mockMvc.get("/search").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    private fun reindexFixture() {
        Mockito.`when`(indexSource.loadPublishedArticles()).thenReturn(
            listOf(
                article(
                    articleId = UUID.fromString("01900000-0000-4000-8000-000000000201"),
                    versionId = DE_2022,
                    countryCode = "DE",
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
                    constitutionTitle = "Basic Law for the Federal Republic of Germany",
                    versionLabel = "2022",
                    effectiveDate = LocalDate.of(2022, 12, 19),
                    articleNumber = "2",
                    title = "Personal freedoms",
                    body = "Every person shall have the right to free development of their personality.",
                ),
                article(
                    articleId = UUID.fromString("01900000-0000-4000-8000-000000000301"),
                    versionId = FR_1958,
                    countryCode = "FR",
                    constitutionTitle = "Constitution of 4 October 1958",
                    versionLabel = "1958",
                    effectiveDate = LocalDate.of(1958, 10, 4),
                    articleNumber = "1",
                    title = "Republic",
                    body = "France is an indivisible republic.",
                ),
            ),
        )

        mockMvc.post("/reindex").andExpect {
            status { isOk() }
            jsonPath("$.documentCount") { value(4) }
            jsonPath("$.status") { value("ready") }
        }
    }

    companion object {
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
            constitutionTitle: String,
            versionLabel: String,
            effectiveDate: LocalDate?,
            articleNumber: String,
            title: String,
            body: String,
        ) = IndexableArticle(
            articleId = articleId,
            versionId = versionId,
            countryCode = countryCode,
            constitutionTitle = constitutionTitle,
            versionLabel = versionLabel,
            effectiveDate = effectiveDate,
            articleNumber = articleNumber,
            title = title,
            body = body,
        )
    }
}

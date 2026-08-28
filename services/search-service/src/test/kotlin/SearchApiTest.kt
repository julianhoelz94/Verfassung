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
    fun reindexThenKeywordSearchFindsArticle() {
        val versionId = UUID.fromString("01900000-0000-4000-8000-000000000004")
        val articleId = UUID.fromString("01900000-0000-4000-8000-000000000201")
        Mockito.`when`(indexSource.loadPublishedArticles()).thenReturn(
            listOf(
                IndexableArticle(
                    articleId = articleId,
                    versionId = versionId,
                    countryCode = "DE",
                    articleNumber = "1",
                    title = "Human dignity",
                    body = "Human dignity shall be inviolable.",
                ),
                IndexableArticle(
                    articleId = UUID.fromString("01900000-0000-4000-8000-000000000202"),
                    versionId = versionId,
                    countryCode = "DE",
                    articleNumber = "2",
                    title = "Personal freedoms",
                    body = "Every person shall have the right to free development of their personality.",
                ),
            ),
        )

        mockMvc.post("/reindex").andExpect {
            status { isOk() }
            jsonPath("$.documentCount") { value(2) }
            jsonPath("$.status") { value("ready") }
        }

        mockMvc.get("/search") {
            param("q", "dignity")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].articleNumber") { value("1") }
            jsonPath("$[0].title") { value("Human dignity") }
            jsonPath("$[0].countryCode") { value("DE") }
            jsonPath("$[0].snippet") { exists() }
        }
    }

    @Test
    fun blankQueryReturnsEmptyList() {
        mockMvc.get("/search").andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
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
